import "server-only";
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { env } from "./env";

export const horizon = new Horizon.Server(env.horizonUrl);
export const usdc = new Asset(env.usdcCode, env.usdcIssuer);

export const keys = {
  platform: () => Keypair.fromSecret(env.platformSecret),
  clinic: () => Keypair.fromSecret(env.clinicSecret),
  arbiter: () => Keypair.fromSecret(env.arbiterSecret),
};

export function memoFrom(type: string | undefined, value: string): Memo {
  if (type === "text") return Memo.text(value);
  if (type === "hash") return Memo.hash(Buffer.from(value, "base64").toString("hex"));
  return Memo.id(value);
}

export function isAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    Keypair.fromPublicKey(value);
    return true;
  } catch {
    return false;
  }
}

export function signXdr(xdr: string, signer: Keypair): string {
  const tx = TransactionBuilder.fromXDR(xdr, env.networkPassphrase);
  tx.sign(signer);
  return tx.toXDR();
}

export async function loadAccount(address: string) {
  try {
    return await horizon.loadAccount(address);
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404 || (error instanceof Error && /not ?found/i.test(error.name + error.message))) {
      return null;
    }
    throw error;
  }
}

export async function fundWithFriendbot(address: string): Promise<boolean> {
  if (await loadAccount(address)) return false;
  const res = await fetch(`${env.friendbotUrl}?addr=${encodeURIComponent(address)}`);
  if (!res.ok && !(await loadAccount(address))) {
    throw new Error(`Friendbot failed for ${address}`);
  }
  return true;
}

export type WalletState = {
  exists: boolean;
  xlm: string;
  usdc: string | null;
};

export async function walletState(address: string): Promise<WalletState> {
  const account = await loadAccount(address);
  if (!account) return { exists: false, xlm: "0", usdc: null };
  let xlm = "0";
  let usdcBalance: string | null = null;
  for (const b of account.balances) {
    if (b.asset_type === "native") xlm = b.balance;
    else if (
      "asset_code" in b &&
      b.asset_code === env.usdcCode &&
      b.asset_issuer === env.usdcIssuer
    ) {
      usdcBalance = b.balance;
    }
  }
  return { exists: true, xlm, usdc: usdcBalance };
}

export async function buildTrustlineXdr(address: string): Promise<string> {
  const account = await horizon.loadAccount(address);
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(Operation.changeTrust({ asset: usdc }))
    .setTimeout(300)
    .build()
    .toXDR();
}

export function isTrustlineFor(xdr: string, address: string): boolean {
  const tx = TransactionBuilder.fromXDR(xdr, env.networkPassphrase);
  if (!(tx instanceof Transaction) || tx.source !== address || tx.operations.length !== 1) return false;
  const op = tx.operations[0];
  return (
    op.type === "changeTrust" &&
    "code" in op.line &&
    op.line.code === env.usdcCode &&
    op.line.issuer === env.usdcIssuer
  );
}

export async function submitXdr(xdr: string): Promise<string> {
  const tx = TransactionBuilder.fromXDR(xdr, env.networkPassphrase);
  try {
    const res = await horizon.submitTransaction(tx);
    return res.hash;
  } catch (error) {
    throw new Error(horizonError(error));
  }
}

export async function ensureTrustline(signer: Keypair): Promise<void> {
  await fundWithFriendbot(signer.publicKey());
  const state = await walletState(signer.publicKey());
  if (state.usdc !== null) return;
  await submitXdr(signXdr(await buildTrustlineXdr(signer.publicKey()), signer));
}

export async function sendUsdc(
  from: Keypair,
  to: string,
  amount: string,
  memo: Memo,
): Promise<string> {
  const account = await horizon.loadAccount(from.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(Operation.payment({ destination: to, asset: usdc, amount }))
    .addMemo(memo)
    .setTimeout(300)
    .build();
  tx.sign(from);
  try {
    const res = await horizon.submitTransaction(tx);
    return res.hash;
  } catch (error) {
    throw new Error(horizonError(error));
  }
}

function horizonError(error: unknown): string {
  const data = (error as { response?: { data?: { extras?: { result_codes?: unknown } } } })
    ?.response?.data;
  if (data?.extras?.result_codes) {
    return `Stellar rejected the transaction: ${JSON.stringify(data.extras.result_codes)}`;
  }
  return error instanceof Error ? error.message : String(error);
}
