import "server-only";
import { type Keypair, WebAuth } from "@stellar/stellar-sdk";
import { db } from "./db";
import { env } from "./env";
import { signXdr } from "./stellar";

const base = `https://${env.anchorDomain}`;

export class AnchorError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.body) headers.set("content-type", "application/json");
  const res = await fetch(`${base}${path}`, { ...init, headers, cache: "no-store" });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = (data as { error?: string })?.error ?? res.statusText;
    throw new AnchorError(`Anchor ${path.split("?")[0]} failed (${res.status}): ${message}`, res.status);
  }
  return data as T;
}

let signingKey: string | null = null;

async function anchorSigningKey(): Promise<string> {
  if (signingKey) return signingKey;
  const res = await fetch(`${base}/.well-known/stellar.toml`, { cache: "no-store" });
  const match = (await res.text()).match(/^SIGNING_KEY\s*=\s*"([A-Z0-9]{56})"/m);
  if (!match) throw new AnchorError("Anchor stellar.toml has no SIGNING_KEY");
  signingKey = match[1];
  return signingKey;
}

export async function challenge(account: string): Promise<string> {
  const data = await request<{ transaction: string }>(
    `/auth?account=${encodeURIComponent(account)}`,
  );
  let client: string;
  try {
    client = WebAuth.readChallengeTx(
      data.transaction,
      await anchorSigningKey(),
      env.networkPassphrase,
      env.anchorDomain,
      env.anchorDomain,
    ).clientAccountID;
  } catch (error) {
    throw new AnchorError(
      `Anchor sent an invalid SEP-10 challenge: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (client !== account) throw new AnchorError("SEP-10 challenge is for a different account");
  return data.transaction;
}

function subject(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function expiry(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {}
  return Date.now() + 60 * 60 * 1000;
}

export async function exchange(account: string, signedChallenge: string): Promise<string> {
  const data = await request<{ token: string }>("/auth", {
    method: "POST",
    body: JSON.stringify({ transaction: signedChallenge }),
  });
  const sub = subject(data.token);
  if (!sub || sub.split(":")[0] !== account) {
    throw new AnchorError("Anchor token was issued for a different account", 403);
  }
  db()
    .prepare(
      "insert into anchor_tokens (account, token, expires_at) values (?, ?, ?) on conflict(account) do update set token = excluded.token, expires_at = excluded.expires_at",
    )
    .run(account, data.token, expiry(data.token));
  return data.token;
}

export function cachedToken(account: string): string | null {
  const row = db()
    .prepare("select token, expires_at from anchor_tokens where account = ?")
    .get(account) as { token: string; expires_at: number } | undefined;
  if (!row || row.expires_at - 60_000 < Date.now()) return null;
  return row.token;
}

export function forgetToken(account: string): void {
  db().prepare("delete from anchor_tokens where account = ?").run(account);
}

export async function withKeyToken<T>(signer: Keypair, fn: (token: string) => Promise<T>): Promise<T> {
  try {
    return await fn(await tokenForKey(signer));
  } catch (error) {
    if (!(error instanceof AnchorError) || error.status !== 401) throw error;
    forgetToken(signer.publicKey());
    return fn(await tokenForKey(signer));
  }
}

export async function tokenForKey(signer: Keypair): Promise<string> {
  const account = signer.publicKey();
  const cached = cachedToken(account);
  if (cached) return cached;
  return exchange(account, signXdr(await challenge(account), signer));
}

export type AnchorTransaction = {
  id: string;
  kind: string;
  status: string;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  stellar_transaction_id?: string;
  withdraw_anchor_account?: string;
  withdraw_memo?: string;
  withdraw_memo_type?: string;
  more_info_url?: string;
};

export type DepositInstructions = {
  id: string;
  how?: string;
  instructions?: Record<string, { value: string; description?: string }>;
  eta?: number;
};

export async function deposit(
  token: string,
  account: string,
  amountTry: string,
): Promise<DepositInstructions> {
  const q = new URLSearchParams({
    asset_code: "USDC",
    account,
    amount: amountTry,
    funding_method: "bank_account",
    type: "bank_account",
  });
  return request<DepositInstructions>(`/sep6/deposit?${q}`, { token });
}

export async function simulateBankTransfer(
  token: string,
  id: string,
  amountTry: string,
): Promise<void> {
  await request(`/sep6/tx/${encodeURIComponent(id)}/simulate-bank-transfer`, {
    method: "POST",
    token,
    body: JSON.stringify({ amount: amountTry }),
  });
}

export async function transaction(token: string, id: string): Promise<AnchorTransaction> {
  const data = await request<{ transaction: AnchorTransaction }>(
    `/sep6/transaction?id=${encodeURIComponent(id)}`,
    { token },
  );
  return data.transaction;
}

export type WithdrawInstructions = {
  id: string;
  account_id: string;
  memo?: string;
  memo_type?: string;
};

export async function withdraw(
  token: string,
  account: string,
  amountUsdc: string,
): Promise<WithdrawInstructions> {
  const q = new URLSearchParams({
    asset_code: "USDC",
    type: "bank_account",
    funding_method: "bank_account",
    amount: amountUsdc,
    account,
  });
  return request<WithdrawInstructions>(`/sep6/withdraw?${q}`, { token });
}

export type AnchorRates = { buy: string; sell: string; minTry: string; maxTry: string; minUsdc: string };

export async function rates(): Promise<AnchorRates | null> {
  try {
    const data = await request<{
      rates?: { buy_rate?: string; sell_rate?: string };
      limits?: { min_onramp_try?: string; max_onramp_try?: string; min_offramp_usdc?: string };
    }>("/health");
    if (!data.rates?.buy_rate || !data.rates.sell_rate) return null;
    return {
      buy: data.rates.buy_rate,
      sell: data.rates.sell_rate,
      minTry: data.limits?.min_onramp_try ?? "50",
      maxTry: data.limits?.max_onramp_try ?? "3000",
      minUsdc: data.limits?.min_offramp_usdc ?? "1",
    };
  } catch {
    return null;
  }
}
