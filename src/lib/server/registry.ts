import "server-only";
import { createHash } from "node:crypto";
import {
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { env } from "./env";
import { keys } from "./stellar";

const server = new rpc.Server(env.rpcUrl);

export function registryEnabled(): boolean {
  return Boolean(env.registryContractId);
}

function contract(): Contract {
  if (!env.registryContractId) throw new Error("Registry contract is not configured");
  return new Contract(env.registryContractId);
}

export function evidenceHash(caseId: string, stage: number, note: string): Buffer {
  return createHash("sha256").update(`hekim|${caseId}|${stage}|${note}`).digest();
}

export function evidenceRoot(hashes: Buffer[]): Buffer {
  const h = createHash("sha256");
  for (const item of hashes) h.update(item);
  return h.digest();
}

const str = (value: string) => nativeToScVal(value, { type: "string" });
const u32 = (value: number) => nativeToScVal(value, { type: "u32" });
const i128 = (value: bigint) => nativeToScVal(value, { type: "i128" });
const bytes32 = (value: Buffer) => xdr.ScVal.scvBytes(value);
const address = (value: string) => nativeToScVal(value, { type: "address" });

async function submit(method: string, args: xdr.ScVal[], signer: Keypair) {
  const account = await server.getAccount(signer.publicKey());
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(contract().call(method, ...args))
    .setTimeout(120)
    .build();
  const prepared = await server.prepareTransaction(built);
  prepared.sign(signer);
  return server.sendTransaction(prepared);
}

async function invoke(method: string, args: xdr.ScVal[], signer: Keypair = keys.platform()) {
  let sent = await submit(method, args, signer);
  for (let i = 0; i < 3 && sent.status === "TRY_AGAIN_LATER"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    sent = await submit(method, args, signer);
  }
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new Error(`Registry ${method} was rejected by the network (${sent.status})`);
  }
  const res = await server.pollTransaction(sent.hash, { attempts: 120 });
  if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
    return { hash: sent.hash, value: res.returnValue ? scValToNative(res.returnValue) : null };
  }
  if (res.status === rpc.Api.GetTransactionStatus.FAILED) {
    throw new Error(`Registry ${method} failed on chain`);
  }
  throw new Error(`Registry ${method} timed out`);
}

async function read(method: string, args: xdr.ScVal[]) {
  const source = keys.platform().publicKey();
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: env.networkPassphrase,
  })
    .addOperation(contract().call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`Registry ${method} read failed: ${sim.error}`);
  return sim.result?.retval ? scValToNative(sim.result.retval) : null;
}

export async function registerClinic(clinic: string, name: string, country: string) {
  return invoke("register_clinic", [address(clinic), str(name), str(country)]);
}

export async function anchorEvidence(caseId: string, stage: number, hash: Buffer) {
  return invoke("anchor_evidence", [str(caseId), u32(stage), bytes32(hash)]);
}

export async function attest(input: {
  caseId: string;
  stage: number;
  phase: number;
  role: number;
  signer: Buffer;
  digest: Buffer;
  signature: Buffer;
}) {
  return invoke("attest", [
    str(input.caseId),
    u32(input.stage),
    u32(input.phase),
    u32(input.role),
    bytes32(input.signer),
    bytes32(input.digest),
    xdr.ScVal.scvBytes(input.signature),
  ]);
}

export async function recordCase(input: {
  caseId: string;
  clinic: string;
  amount: bigint;
  released: bigint;
  refunded: bigint;
  disputes: number;
  root: Buffer;
}) {
  return invoke("record_case", [
    str(input.caseId),
    address(input.clinic),
    i128(input.amount),
    i128(input.released),
    i128(input.refunded),
    u32(input.disputes),
    bytes32(input.root),
  ]);
}

export type ClinicRecord = {
  name: string;
  country: string;
  registeredAt: number;
  cases: number;
  cleanCases: number;
  disputedCases: number;
  refundedCases: number;
  volume: string;
  released: string;
  refunded: string;
  trustScore: number;
};

function stroopsToUsdc(value: bigint | number): string {
  return (Number(value) / 10_000_000).toFixed(2);
}

export async function clinicRecord(clinic: string): Promise<ClinicRecord | null> {
  const raw = (await read("clinic", [address(clinic)])) as Record<string, unknown> | null;
  if (!raw) return null;
  const score = Number(await read("trust_score", [address(clinic)]));
  return {
    name: String(raw.name),
    country: String(raw.country),
    registeredAt: Number(raw.registered_at),
    cases: Number(raw.cases),
    cleanCases: Number(raw.clean_cases),
    disputedCases: Number(raw.disputed_cases),
    refundedCases: Number(raw.refunded_cases),
    volume: stroopsToUsdc(raw.volume as bigint),
    released: stroopsToUsdc(raw.released as bigint),
    refunded: stroopsToUsdc(raw.refunded as bigint),
    trustScore: score,
  };
}

export async function evidenceOnChain(caseId: string, stage: number) {
  const raw = (await read("evidence", [str(caseId), u32(stage)])) as {
    hash: Buffer | Uint8Array;
    anchored_at: bigint;
  } | null;
  if (!raw) return null;
  return {
    hash: Buffer.from(raw.hash).toString("hex"),
    anchoredAt: Number(raw.anchored_at),
  };
}

export async function caseOnChain(caseId: string) {
  const raw = (await read("case", [str(caseId)])) as Record<string, unknown> | null;
  if (!raw) return null;
  return {
    outcome: String(Array.isArray(raw.outcome) ? raw.outcome[0] : raw.outcome),
    amount: stroopsToUsdc(raw.amount as bigint),
    released: stroopsToUsdc(raw.released as bigint),
    refunded: stroopsToUsdc(raw.refunded as bigint),
    disputes: Number(raw.disputes),
    evidenceRoot: Buffer.from(raw.evidence_root as Uint8Array).toString("hex"),
    closedAt: Number(raw.closed_at),
  };
}
