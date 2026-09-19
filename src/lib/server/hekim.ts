import "server-only";
import { randomBytes } from "node:crypto";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { fromStroops, percentOf, toStroops } from "@/lib/money";
import type {
  CaseEvent,
  CaseStatus,
  CaseView,
  DisputeKind,
  Milestone,
  MilestoneStatus,
  Ramp,
  Rules,
  Signable,
} from "@/lib/types";
import * as anchor from "./anchor";
import { db, now } from "./db";
import { env } from "./env";
import { keys, memoFrom, sendUsdc, signXdr } from "./stellar";
import * as registry from "./registry";
import { send, tw } from "./trustless";

export class HekimError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type CaseRow = {
  id: string;
  title: string;
  treatment: string;
  patient_name: string;
  patient_email: string;
  clinic_name: string;
  total: string;
  status: CaseStatus;
  patient_address: string | null;
  contract_id: string | null;
  created_at: string;
  accepted_at: string | null;
  funded_at: string | null;
  registry_tx: string | null;
};

type MilestoneRow = {
  case_id: string;
  idx: number;
  title: string;
  amount: string;
  status: MilestoneStatus;
  evidence: string | null;
  completed_at: string | null;
  dispute_kind: DisputeKind | null;
  dispute_note: string | null;
  patient_share: number | null;
  evidence_hash: string | null;
  evidence_tx: string | null;
};

type EventRow = {
  id: number;
  actor: string;
  kind: string;
  detail: string | null;
  tx_hash: string | null;
  created_at: string;
};

type RampRow = {
  id: string;
  case_id: string | null;
  party: "patient" | "clinic";
  account: string;
  kind: "deposit" | "withdraw";
  amount_in: string;
  amount_out: string | null;
  status: string;
  payment_hash: string | null;
  created_at: string;
  updated_at: string;
};

export const NO_SHOW_PATIENT_PERCENT = 50;

export function rules(): Rules {
  return {
    approvalWindowMinutes: env.approvalWindowMinutes,
    platformFeePercent: env.platformFeePercent,
    protocolFeePercent: env.protocolFeePercent,
    noShowPatientPercent: NO_SHOW_PATIENT_PERCENT,
  };
}

function signable(xdr: string): Signable {
  return { xdr, networkPassphrase: env.networkPassphrase };
}

function txHash(xdr: string): string {
  return Buffer.from(TransactionBuilder.fromXDR(xdr, env.networkPassphrase).hash()).toString("hex");
}

function logEvent(
  caseId: string,
  actor: string,
  kind: string,
  detail: string | null = null,
  hash: string | null = null,
) {
  db()
    .prepare(
      "insert into events (case_id, actor, kind, detail, tx_hash, created_at) values (?, ?, ?, ?, ?, ?)",
    )
    .run(caseId, actor, kind, detail, hash, now());
}

function caseRow(id: string): CaseRow {
  const row = db().prepare("select * from cases where id = ?").get(id) as CaseRow | undefined;
  if (!row) throw new HekimError("Case not found", 404);
  return row;
}

function milestoneRows(caseId: string): MilestoneRow[] {
  return db()
    .prepare("select * from milestones where case_id = ? order by idx")
    .all(caseId) as MilestoneRow[];
}

function milestoneRow(caseId: string, idx: number): MilestoneRow {
  const row = db()
    .prepare("select * from milestones where case_id = ? and idx = ?")
    .get(caseId, idx) as MilestoneRow | undefined;
  if (!row) throw new HekimError("Milestone not found", 404);
  return row;
}

function setMilestone(caseId: string, idx: number, fields: Partial<MilestoneRow>) {
  const entries = Object.entries(fields);
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  db()
    .prepare(`update milestones set ${sets} where case_id = ? and idx = ?`)
    .run(...(entries.map(([, v]) => v) as (string | number | null)[]), caseId, idx);
}

function setCase(caseId: string, fields: Partial<CaseRow>) {
  const entries = Object.entries(fields);
  const sets = entries.map(([k]) => `${k} = ?`).join(", ");
  db()
    .prepare(`update cases set ${sets} where id = ?`)
    .run(...(entries.map(([, v]) => v) as (string | number | null)[]), caseId);
}

function approvalDue(row: MilestoneRow): string | null {
  if (row.status !== "completed" || !row.completed_at) return null;
  return new Date(
    new Date(row.completed_at).getTime() + env.approvalWindowMinutes * 60_000,
  ).toISOString();
}

function toMilestone(row: MilestoneRow): Milestone {
  return {
    idx: row.idx,
    title: row.title,
    amount: row.amount,
    status: row.status,
    evidence: row.evidence,
    completedAt: row.completed_at,
    approvalDue: approvalDue(row),
    disputeKind: row.dispute_kind,
    disputeNote: row.dispute_note,
    patientShare: row.patient_share,
    evidenceHash: row.evidence_hash,
    evidenceTx: row.evidence_tx,
  };
}

function toRamp(row: RampRow): Ramp {
  return {
    id: row.id,
    party: row.party,
    kind: row.kind,
    amountIn: row.amount_in,
    amountOut: row.amount_out,
    status: row.status,
    paymentHash: row.payment_hash,
    createdAt: row.created_at,
  };
}

export function getCase(id: string): CaseView {
  const row = caseRow(id);
  const ms = milestoneRows(id);
  const events = db()
    .prepare("select * from events where case_id = ? order by id desc")
    .all(id) as EventRow[];
  const ramps = db()
    .prepare("select * from ramps where case_id = ? order by created_at desc")
    .all(id) as RampRow[];
  let released = 0n;
  let refunded = 0n;
  let locked = 0n;
  for (const m of ms) {
    const amount = toStroops(m.amount);
    if (m.status === "released") released += amount;
    else if (m.status === "resolved") {
      const toPatient = percentOf(amount, BigInt((m.patient_share ?? 0) * 100));
      refunded += toPatient;
      released += amount - toPatient;
    } else if (row.status === "funded") locked += amount;
  }
  return {
    id: row.id,
    title: row.title,
    treatment: row.treatment,
    patientName: row.patient_name,
    patientEmail: row.patient_email,
    clinicName: row.clinic_name,
    total: row.total,
    status: row.status,
    patientAddress: row.patient_address,
    contractId: row.contract_id,
    createdAt: row.created_at,
    acceptedAt: row.accepted_at,
    fundedAt: row.funded_at,
    registryTx: row.registry_tx,
    milestones: ms.map(toMilestone),
    events: events.map(
      (e): CaseEvent => ({
        id: e.id,
        actor: e.actor,
        kind: e.kind,
        detail: e.detail,
        txHash: e.tx_hash,
        createdAt: e.created_at,
      }),
    ),
    ramps: ramps.map(toRamp),
    released: fromStroops(released),
    refunded: fromStroops(refunded),
    locked: fromStroops(locked),
  };
}

export function listCases(filter: { email?: string; address?: string } = {}): CaseView[] {
  let rows: { id: string }[];
  if (filter.email || filter.address) {
    rows = db()
      .prepare(
        "select id from cases where lower(patient_email) = lower(?) or patient_address = ? order by created_at desc",
      )
      .all(filter.email ?? "", filter.address ?? "") as { id: string }[];
  } else {
    rows = db().prepare("select id from cases order by created_at desc").all() as { id: string }[];
  }
  return rows.map((r) => getCase(r.id));
}

export function listDisputes(): { caseView: CaseView; milestone: Milestone }[] {
  const rows = db()
    .prepare("select case_id, idx from milestones where status = 'disputed' order by case_id")
    .all() as { case_id: string; idx: number }[];
  return rows.map((r) => {
    const caseView = getCase(r.case_id);
    return { caseView, milestone: caseView.milestones[r.idx] };
  });
}

export type NewCase = {
  title: string;
  treatment: string;
  patientName: string;
  patientEmail: string;
  clinicName: string;
  total: string;
  milestones: { title: string; percent: number }[];
};

function text(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim()) throw new HekimError(`${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HekimError(`${field} is too long`);
  return trimmed;
}

export function createCase(input: NewCase): CaseView {
  const title = text(input.title, "Title", 120);
  const treatment = text(input.treatment, "Treatment", 120);
  const patientName = text(input.patientName, "Patient name", 120);
  const patientEmail = text(input.patientEmail, "Patient email", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patientEmail)) throw new HekimError("Invalid email");
  const clinicName = text(input.clinicName, "Clinic name", 120);
  const totalStroops = toStroops(String(input.total));
  if (totalStroops < toStroops("3")) throw new HekimError("Total must be at least 3 USDC");
  const plan = input.milestones;
  if (!Array.isArray(plan) || plan.length < 1 || plan.length > 6) {
    throw new HekimError("A plan needs between 1 and 6 stages");
  }
  const percents = plan.map((m) => Math.round(Number(m.percent)));
  if (percents.some((p) => !Number.isFinite(p) || p <= 0)) {
    throw new HekimError("Every stage needs a positive share");
  }
  if (percents.reduce((a, b) => a + b, 0) !== 100) {
    throw new HekimError("Stage shares must add up to 100%");
  }
  const amounts = percents.map((p) => {
    const raw = percentOf(totalStroops, BigInt(p * 100));
    return raw - (raw % 100_000n);
  });
  amounts[amounts.length - 1] += totalStroops - amounts.reduce((a, b) => a + b, 0n);
  if (amounts.some((a) => a < toStroops("1"))) {
    throw new HekimError("Every stage must be at least 1 USDC");
  }

  const id = `HK-${randomBytes(3).toString("hex").toUpperCase()}`;
  const created = now();
  const database = db();
  database.exec("begin");
  try {
    database
      .prepare(
        "insert into cases (id, title, treatment, patient_name, patient_email, clinic_name, total, status, created_at) values (?, ?, ?, ?, ?, ?, ?, 'open', ?)",
      )
      .run(id, title, treatment, patientName, patientEmail, clinicName, fromStroops(totalStroops), created);
    const insert = database.prepare(
      "insert into milestones (case_id, idx, title, amount, status) values (?, ?, ?, ?, 'pending')",
    );
    plan.forEach((m, i) => insert.run(id, i, text(m.title, "Stage title", 120), fromStroops(amounts[i])));
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
  logEvent(id, "clinic", "case_created", `${fromStroops(totalStroops)} USDC plan in ${plan.length} stages`);
  return getCase(id);
}

function assertPatient(row: CaseRow, address: string) {
  if (!row.patient_address || row.patient_address !== address) {
    throw new HekimError("This case belongs to another wallet", 403);
  }
}

function createIntent(caseId: string, action: string, xdr: string, idx: number | null = null, note: string | null = null) {
  db()
    .prepare(
      "insert or replace into intents (tx_hash, case_id, action, idx, note, created_at) values (?, ?, ?, ?, ?, ?)",
    )
    .run(txHash(xdr), caseId, action, idx, note, now());
  return signable(xdr);
}

function consumeIntent(caseId: string, action: string, signedXdr: string) {
  const hash = txHash(signedXdr);
  const row = db()
    .prepare("select * from intents where tx_hash = ? and case_id = ? and action = ?")
    .get(hash, caseId, action) as { idx: number | null; note: string | null } | undefined;
  if (!row) throw new HekimError("This signature does not match a prepared action", 409);
  db().prepare("delete from intents where tx_hash = ?").run(hash);
  return { idx: row.idx, note: row.note, hash };
}

export async function acceptCase(caseId: string, address: string, email: string): Promise<CaseView> {
  const row = caseRow(caseId);
  if (row.patient_email.toLowerCase() !== email.trim().toLowerCase()) {
    throw new HekimError("This plan was issued to a different email", 403);
  }
  if (row.status !== "open") {
    assertPatient(row, address);
    return getCase(caseId);
  }
  const platform = keys.platform();
  const clinic = keys.clinic();
  const arbiter = keys.arbiter();
  const ms = milestoneRows(caseId);
  const xdr = await tw.deploy({
    signer: platform.publicKey(),
    engagementId: row.id,
    title: `hekim ${row.id}`,
    description: "Staged treatment payment plan. Medical details are kept off chain.",
    approver: address,
    serviceProvider: clinic.publicKey(),
    platformAddress: platform.publicKey(),
    releaseSigner: platform.publicKey(),
    disputeResolver: arbiter.publicKey(),
    platformFee: env.platformFeePercent,
    trustlineAddress: env.usdcIssuer,
    milestones: ms.map((m) => ({
      description: `Stage ${m.idx + 1}`,
      amount: Number(m.amount),
      receiver: clinic.publicKey(),
    })),
  });
  const signed = signXdr(xdr, platform);
  const result = await send(signed);
  if (!result.contractId) throw new HekimError("Escrow was deployed without a contract id", 502);
  setCase(caseId, {
    status: "accepted",
    patient_address: address,
    contract_id: result.contractId,
    accepted_at: now(),
  });
  logEvent(caseId, "patient", "plan_accepted", `Escrow ${result.contractId}`, txHash(signed));
  return getCase(caseId);
}

export async function prepareFund(caseId: string, address: string): Promise<Signable> {
  const row = caseRow(caseId);
  assertPatient(row, address);
  if (row.status !== "accepted" || !row.contract_id) throw new HekimError("Case is not ready for funding");
  const xdr = await tw.fund(row.contract_id, address, Number(row.total));
  return createIntent(caseId, "fund", xdr);
}

export async function prepareApprove(caseId: string, address: string, idx: number): Promise<Signable> {
  const row = caseRow(caseId);
  assertPatient(row, address);
  const m = milestoneRow(caseId, idx);
  if (m.status !== "completed") throw new HekimError("This stage has not been reported as done");
  const xdr = await tw.approve(row.contract_id!, idx, address);
  return createIntent(caseId, "approve", xdr, idx);
}

export async function prepareDispute(
  caseId: string,
  address: string,
  idx: number,
  note: string,
): Promise<Signable> {
  const row = caseRow(caseId);
  assertPatient(row, address);
  if (row.status !== "funded") throw new HekimError("Only a funded plan can be disputed");
  const m = milestoneRow(caseId, idx);
  if (m.status !== "pending" && m.status !== "completed") {
    throw new HekimError("This stage can no longer be disputed");
  }
  const reason = text(note, "Reason", 500);
  const xdr = await tw.dispute(row.contract_id!, idx, address);
  return createIntent(caseId, "dispute", xdr, idx, reason);
}

export async function submitPatient(
  caseId: string,
  address: string,
  action: "fund" | "approve" | "dispute",
  signedXdr: string,
): Promise<CaseView> {
  const row = caseRow(caseId);
  assertPatient(row, address);
  const intent = consumeIntent(caseId, action, signedXdr);
  await send(signedXdr);
  if (action === "fund") {
    setCase(caseId, { status: "funded", funded_at: now() });
    logEvent(caseId, "patient", "escrow_funded", `${row.total} USDC locked`, intent.hash);
  } else if (action === "approve") {
    const idx = intent.idx!;
    setMilestone(caseId, idx, { status: "approved" });
    logEvent(caseId, "patient", "stage_approved", milestoneRow(caseId, idx).title, intent.hash);
    await releaseStage(caseId, idx);
  } else {
    const idx = intent.idx!;
    setMilestone(caseId, idx, { status: "disputed", dispute_kind: "patient", dispute_note: intent.note });
    logEvent(caseId, "patient", "dispute_opened", intent.note, intent.hash);
  }
  return getCase(caseId);
}

export async function releaseStage(caseId: string, idx: number): Promise<CaseView> {
  const row = caseRow(caseId);
  const m = milestoneRow(caseId, idx);
  if (m.status !== "approved") throw new HekimError("Stage is not approved");
  const platform = keys.platform();
  const signed = signXdr(await tw.release(row.contract_id!, idx, platform.publicKey()), platform);
  await send(signed);
  setMilestone(caseId, idx, { status: "released" });
  logEvent(caseId, "platform", "stage_released", `${m.amount} USDC to clinic`, txHash(signed));
  await closeIfDone(caseId);
  return getCase(caseId);
}

async function closeIfDone(caseId: string) {
  const ms = milestoneRows(caseId);
  if (!ms.every((m) => m.status === "released" || m.status === "resolved")) return;
  setCase(caseId, { status: "closed" });
  logEvent(caseId, "platform", "case_closed");
  await recordOnRegistry(caseId);
}

export async function recordOnRegistry(caseId: string): Promise<void> {
  if (!registry.registryEnabled()) return;
  const row = caseRow(caseId);
  if (row.registry_tx || row.status !== "closed") return;
  const view = getCase(caseId);
  const ms = milestoneRows(caseId);
  const hashes = ms.map((m) =>
    m.evidence_hash ? Buffer.from(m.evidence_hash, "hex") : registry.evidenceHash(caseId, m.idx, ""),
  );
  const disputes = ms.filter((m) => m.dispute_kind && m.dispute_kind !== "cancel").length;
  try {
    const result = await registry.recordCase({
      caseId,
      clinic: keys.clinic().publicKey(),
      amount: toStroops(row.total),
      released: toStroops(view.released),
      refunded: toStroops(view.refunded),
      disputes,
      root: registry.evidenceRoot(hashes),
    });
    setCase(caseId, { registry_tx: result.hash });
    logEvent(caseId, "platform", "registry_recorded", String(result.value ?? ""), result.hash);
  } catch (error) {
    logEvent(caseId, "platform", "registry_failed", error instanceof Error ? error.message : String(error));
  }
}

async function anchorStageEvidence(caseId: string, idx: number, note: string) {
  const hash = registry.evidenceHash(caseId, idx, note);
  setMilestone(caseId, idx, { evidence_hash: hash.toString("hex") });
  if (!registry.registryEnabled()) return;
  try {
    const result = await registry.anchorEvidence(caseId, idx, hash);
    setMilestone(caseId, idx, { evidence_tx: result.hash });
    logEvent(caseId, "platform", "evidence_anchored", hash.toString("hex"), result.hash);
  } catch (error) {
    logEvent(caseId, "platform", "registry_failed", error instanceof Error ? error.message : String(error));
  }
}

export async function retryRegistry(caseId: string): Promise<CaseView> {
  for (const m of milestoneRows(caseId)) {
    if (m.evidence && !m.evidence_tx) {
      db().prepare("update milestones set evidence_hash = null where case_id = ? and idx = ?").run(caseId, m.idx);
      await anchorStageEvidence(caseId, m.idx, m.evidence);
    }
  }
  await recordOnRegistry(caseId);
  return getCase(caseId);
}

export async function completeStage(caseId: string, idx: number, evidence: string): Promise<CaseView> {
  const row = caseRow(caseId);
  if (row.status !== "funded") throw new HekimError("The patient has not funded this plan yet");
  const ms = milestoneRows(caseId);
  const m = ms[idx];
  if (!m) throw new HekimError("Milestone not found", 404);
  if (m.status !== "pending") throw new HekimError("This stage is not open");
  if (ms.slice(0, idx).some((p) => p.status !== "released" && p.status !== "resolved")) {
    throw new HekimError("Finish the previous stage first");
  }
  const note = text(evidence, "Evidence note", 500);
  const digest = registry.evidenceHash(caseId, idx, note).toString("hex");
  const clinic = keys.clinic();
  const signed = signXdr(
    await tw.changeStatus(row.contract_id!, idx, "completed", `sha256:${digest}`, clinic.publicKey()),
    clinic,
  );
  await send(signed);
  setMilestone(caseId, idx, { status: "completed", evidence: note, completed_at: now() });
  logEvent(caseId, "clinic", "stage_completed", `${m.title}: ${note}`, txHash(signed));
  await anchorStageEvidence(caseId, idx, note);
  return getCase(caseId);
}

async function clinicDispute(row: CaseRow, idx: number, kind: DisputeKind, note: string) {
  const clinic = keys.clinic();
  const signed = signXdr(await tw.dispute(row.contract_id!, idx, clinic.publicKey()), clinic);
  await send(signed);
  setMilestone(row.id, idx, { status: "disputed", dispute_kind: kind, dispute_note: note });
  return txHash(signed);
}

export async function clinicClaim(
  caseId: string,
  idx: number,
  kind: "no_response" | "no_show",
  note: string,
): Promise<CaseView> {
  const row = caseRow(caseId);
  if (row.status !== "funded") throw new HekimError("The plan is not funded");
  const m = milestoneRow(caseId, idx);
  const reason = text(note, "Note", 500);
  if (kind === "no_response") {
    const due = approvalDue(m);
    if (m.status !== "completed" || !due) throw new HekimError("This stage is not waiting for approval");
    if (Date.now() < new Date(due).getTime()) {
      throw new HekimError("The patient still has time to respond");
    }
  } else {
    if (idx !== 0 || m.status !== "pending") {
      throw new HekimError("A no-show can only be reported before the first stage starts");
    }
  }
  const hash = await clinicDispute(row, idx, kind, reason);
  logEvent(caseId, "clinic", kind === "no_show" ? "no_show_reported" : "no_response_reported", reason, hash);
  return getCase(caseId);
}

export function splitForResolution(amount: string, patientPercent: number) {
  const gross = toStroops(amount);
  const feeBps = BigInt(Math.round((env.platformFeePercent + env.protocolFeePercent) * 100));
  const net = gross - percentOf(gross, feeBps);
  const patient = percentOf(net, BigInt(patientPercent * 100));
  const clinic = net - patient;
  return { gross, net, patient, clinic };
}

async function resolveStage(row: CaseRow, idx: number, patientPercent: number) {
  const m = milestoneRow(row.id, idx);
  const split = splitForResolution(m.amount, patientPercent);
  const distributions: { address: string; amount: number }[] = [];
  if (split.patient > 0n) {
    distributions.push({ address: row.patient_address!, amount: Number(fromStroops(split.patient)) });
  }
  if (split.clinic > 0n) {
    distributions.push({ address: keys.clinic().publicKey(), amount: Number(fromStroops(split.clinic)) });
  }
  const arbiter = keys.arbiter();
  const signed = signXdr(
    await tw.resolve(row.contract_id!, idx, arbiter.publicKey(), distributions),
    arbiter,
  );
  await send(signed);
  setMilestone(row.id, idx, { status: "resolved", patient_share: patientPercent });
  return { hash: txHash(signed), split };
}

export async function resolveDispute(
  caseId: string,
  idx: number,
  patientPercent: number,
  refundRest: boolean,
): Promise<CaseView> {
  const row = caseRow(caseId);
  const m = milestoneRow(caseId, idx);
  if (m.status !== "disputed") throw new HekimError("This stage is not in dispute");
  const share = Math.round(Number(patientPercent));
  if (!Number.isFinite(share) || share < 0 || share > 100) {
    throw new HekimError("Patient share must be between 0 and 100");
  }
  const { hash, split } = await resolveStage(row, idx, share);
  logEvent(
    caseId,
    "arbiter",
    "dispute_resolved",
    `${m.title}: ${share}% to patient (${fromStroops(split.patient)} USDC), ${100 - share}% to clinic (${fromStroops(split.clinic)} USDC)`,
    hash,
  );
  if (refundRest || m.dispute_kind === "no_show") {
    for (const rest of milestoneRows(caseId)) {
      if (rest.idx === idx || (rest.status !== "pending" && rest.status !== "completed")) continue;
      const disputeHash = await clinicDispute(row, rest.idx, "cancel", "Plan cancelled by arbiter decision");
      logEvent(caseId, "platform", "stage_cancelled", rest.title, disputeHash);
      const refund = await resolveStage(row, rest.idx, 100);
      logEvent(
        caseId,
        "arbiter",
        "stage_refunded",
        `${rest.title}: ${fromStroops(refund.split.patient)} USDC back to patient`,
        refund.hash,
      );
    }
  }
  await closeIfDone(caseId);
  return getCase(caseId);
}

export async function sep10Challenge(address: string): Promise<Signable> {
  return signable(await anchor.challenge(address));
}

export async function sep10Submit(address: string, signedXdr: string): Promise<{ ok: true }> {
  await anchor.exchange(address, signedXdr);
  return { ok: true };
}

export function anchorSession(address: string): boolean {
  return anchor.cachedToken(address) !== null;
}

function rampRow(id: string): RampRow {
  const row = db().prepare("select * from ramps where id = ?").get(id) as RampRow | undefined;
  if (!row) throw new HekimError("Transfer not found", 404);
  return row;
}

function patientToken(address: string): string {
  const token = anchor.cachedToken(address);
  if (!token) throw new HekimError("Sign in to the anchor first", 401);
  return token;
}

export async function startDeposit(
  address: string,
  amountTry: string,
  caseId: string | null,
): Promise<{ ramp: Ramp; instructions: anchor.DepositInstructions }> {
  const amount = Number(amountTry);
  if (!Number.isFinite(amount) || amount < 50 || amount > 3000) {
    throw new HekimError("Top-ups must be between 50 and 3,000 TRY");
  }
  if (caseId) assertPatient(caseRow(caseId), address);
  const token = patientToken(address);
  const instructions = await anchor.deposit(token, address, amount.toFixed(2));
  const created = now();
  db()
    .prepare(
      "insert into ramps (id, case_id, party, account, kind, amount_in, status, created_at, updated_at) values (?, ?, 'patient', ?, 'deposit', ?, 'pending_user_transfer_start', ?, ?)",
    )
    .run(instructions.id, caseId, address, amount.toFixed(2), created, created);
  if (caseId) logEvent(caseId, "patient", "topup_started", `${amount.toFixed(2)} TRY bank transfer`);
  return { ramp: toRamp(rampRow(instructions.id)), instructions };
}

export async function simulateDeposit(address: string, rampId: string): Promise<Ramp> {
  const row = rampRow(rampId);
  if (row.account !== address || row.kind !== "deposit") throw new HekimError("Not your transfer", 403);
  await anchor.simulateBankTransfer(patientToken(address), rampId, row.amount_in);
  return refreshRamp(rampId);
}

export async function refreshRamp(rampId: string): Promise<Ramp> {
  const row = rampRow(rampId);
  let tx: anchor.AnchorTransaction;
  if (row.party === "clinic") {
    tx = await anchor.withKeyToken(keys.clinic(), (token) => anchor.transaction(token, rampId));
  } else {
    const token = anchor.cachedToken(row.account);
    if (!token) return toRamp(row);
    try {
      tx = await anchor.transaction(token, rampId);
    } catch (error) {
      if (error instanceof anchor.AnchorError && error.status === 401) {
        anchor.forgetToken(row.account);
        return toRamp(row);
      }
      throw error;
    }
  }
  const amountOut = tx.amount_out ?? row.amount_out;
  db()
    .prepare("update ramps set status = ?, amount_out = ?, updated_at = ? where id = ?")
    .run(tx.status, amountOut ?? null, now(), rampId);
  if (row.status !== "completed" && tx.status === "completed" && row.case_id) {
    logEvent(
      row.case_id,
      row.party,
      row.kind === "deposit" ? "topup_completed" : "payout_completed",
      row.kind === "deposit"
        ? `${row.amount_in} TRY became ${amountOut} USDC`
        : `${row.amount_in} USDC paid out as ${amountOut} TRY`,
      tx.stellar_transaction_id ?? null,
    );
  }
  return toRamp(rampRow(rampId));
}

export function patientRamps(address: string): Ramp[] {
  return (
    db()
      .prepare("select * from ramps where account = ? order by created_at desc limit 20")
      .all(address) as RampRow[]
  ).map(toRamp);
}

export function clinicRamps(): Ramp[] {
  return (
    db()
      .prepare("select * from ramps where party = 'clinic' order by created_at desc limit 20")
      .all() as RampRow[]
  ).map(toRamp);
}

export async function clinicWithdraw(amountUsdc: string, caseId: string | null): Promise<Ramp> {
  const amount = Number(amountUsdc);
  if (!Number.isFinite(amount) || amount < 1) throw new HekimError("Payouts start at 1 USDC");
  const clinic = keys.clinic();
  const value = fromStroops(toStroops(amount.toFixed(7)));
  const instructions = await anchor.withKeyToken(clinic, (token) =>
    anchor.withdraw(token, clinic.publicKey(), value),
  );
  if (!instructions.memo) throw new HekimError("Anchor returned no memo", 502);
  const hash = await sendUsdc(
    clinic,
    instructions.account_id,
    value,
    memoFrom(instructions.memo_type, instructions.memo),
  );
  const created = now();
  db()
    .prepare(
      "insert into ramps (id, case_id, party, account, kind, amount_in, status, payment_hash, created_at, updated_at) values (?, ?, 'clinic', ?, 'withdraw', ?, 'pending_anchor', ?, ?, ?)",
    )
    .run(instructions.id, caseId, clinic.publicKey(), value, hash, created, created);
  if (caseId) logEvent(caseId, "clinic", "payout_started", `${value} USDC to the clinic IBAN`, hash);
  return refreshRamp(instructions.id).catch(() => toRamp(rampRow(instructions.id)));
}

export function createDemoCase(email: string, name: string): CaseView {
  return createCase({
    title: "Dental implant package",
    treatment: "Two implants with zirconia crowns",
    patientName: name.trim() || "Demo patient",
    patientEmail: email,
    clinicName: env.clinicName,
    total: "6",
    milestones: [
      { title: "Arrival and examination", percent: 20 },
      { title: "Implant surgery", percent: 60 },
      { title: "Day 7 check-up", percent: 20 },
    ],
  });
}

export async function clinicProfile() {
  const address = keys.clinic().publicKey();
  let record: registry.ClinicRecord | null = null;
  if (registry.registryEnabled()) {
    try {
      record = await registry.clinicRecord(address);
    } catch {
      record = null;
    }
  }
  return {
    address,
    name: env.clinicName,
    country: env.clinicCountry,
    registryContractId: env.registryContractId || null,
    record,
  };
}
