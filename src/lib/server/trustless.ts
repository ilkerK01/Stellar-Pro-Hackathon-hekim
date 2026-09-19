import "server-only";
import type { Keypair } from "@stellar/stellar-sdk";
import { env } from "./env";
import { signXdr } from "./stellar";

type Json = Record<string, unknown>;

export class TrustlessError extends Error {}

async function call<T = Json>(path: string, body?: Json, method = "POST"): Promise<T> {
  const res = await fetch(`${env.twBaseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-api-key": env.twApiKey },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message =
      (data as { message?: unknown })?.message ?? (typeof data === "string" ? data : res.statusText);
    throw new TrustlessError(
      `Trustless Work ${path} failed (${res.status}): ${
        Array.isArray(message) ? message.join(", ") : String(message)
      }`,
    );
  }
  return data as T;
}

async function unsigned(path: string, body: Json): Promise<string> {
  const data = await call<{ unsignedTransaction?: string }>(path, body);
  if (!data.unsignedTransaction) {
    throw new TrustlessError(`Trustless Work ${path} returned no transaction`);
  }
  return data.unsignedTransaction;
}

export type SendResult = { status?: string; message?: string; contractId?: string; hash?: string };

export async function send(signedXdr: string): Promise<SendResult> {
  const data = await call<SendResult>("/helper/send-transaction", { signedXdr });
  if (data.status && data.status !== "SUCCESS") {
    throw new TrustlessError(data.message ?? "Transaction was not accepted");
  }
  return data;
}

export async function signAndSend(xdr: string, signer: Keypair): Promise<SendResult> {
  return send(signXdr(xdr, signer));
}

export type DeployInput = {
  signer: string;
  engagementId: string;
  title: string;
  description: string;
  approver: string;
  serviceProvider: string;
  platformAddress: string;
  releaseSigner: string;
  disputeResolver: string;
  platformFee: number;
  trustlineAddress: string;
  milestones: { description: string; amount: number; receiver: string }[];
};

export const tw = {
  deploy: (i: DeployInput) =>
    unsigned("/deployer/multi-release", {
      signer: i.signer,
      engagementId: i.engagementId,
      title: i.title,
      description: i.description,
      roles: {
        approver: i.approver,
        serviceProvider: i.serviceProvider,
        platformAddress: i.platformAddress,
        releaseSigner: i.releaseSigner,
        disputeResolver: i.disputeResolver,
      },
      platformFee: i.platformFee,
      trustline: { address: i.trustlineAddress, symbol: "USDC" },
      milestones: i.milestones,
    }),
  fund: (contractId: string, signer: string, amount: number) =>
    unsigned("/escrow/multi-release/fund-escrow", { contractId, signer, amount }),
  changeStatus: (
    contractId: string,
    milestoneIndex: number,
    newStatus: string,
    newEvidence: string,
    serviceProvider: string,
  ) =>
    unsigned("/escrow/multi-release/change-milestone-status", {
      contractId,
      milestoneIndex: String(milestoneIndex),
      newStatus,
      newEvidence,
      serviceProvider,
    }),
  approve: (contractId: string, milestoneIndex: number, approver: string) =>
    unsigned("/escrow/multi-release/approve-milestone", {
      contractId,
      milestoneIndex: String(milestoneIndex),
      approver,
    }),
  release: (contractId: string, milestoneIndex: number, releaseSigner: string) =>
    unsigned("/escrow/multi-release/release-milestone-funds", {
      contractId,
      milestoneIndex: String(milestoneIndex),
      releaseSigner,
    }),
  dispute: (contractId: string, milestoneIndex: number, signer: string) =>
    unsigned("/escrow/multi-release/dispute-milestone", {
      contractId,
      milestoneIndex: String(milestoneIndex),
      signer,
    }),
  resolve: (
    contractId: string,
    milestoneIndex: number,
    disputeResolver: string,
    distributions: { address: string; amount: number }[],
  ) =>
    unsigned("/escrow/multi-release/resolve-milestone-dispute", {
      contractId,
      milestoneIndex: String(milestoneIndex),
      disputeResolver,
      distributions,
    }),
  escrow: async (contractId: string) => {
    const data = await call<unknown>(
      `/helper/get-escrow-by-contract-ids?contractIds[]=${encodeURIComponent(contractId)}&validateOnChain=true`,
      undefined,
      "GET",
    );
    return Array.isArray(data) ? (data[0] as Json | undefined) ?? null : null;
  },
};
