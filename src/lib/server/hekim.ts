import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import {
  attestMessage,
  patientEntryStatement,
  patientExitStatement,
  PHASE_CODE,
  ROLE_CODE,
  SEP53_PREFIX,
  type Phase,
  type Role,
} from "@/lib/attest";
import { fromStroops, percentOf, toStroops } from "@/lib/money";
import type {
  AttestationView,
  CaseEvent,
  CaseStatus,
  CaseView,
  DisputeKind,
  Milestone,
  MilestoneStatus,
  Ramp,
  Rules,
  Signable,
  SignatureDue,
  SignRequest,
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
  registry_score: number | null;
  registry_cases: number | null;
  signatures_required: number;
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
    signatureWindowMinutes: env.signatureWindowMinutes,
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

type AttestationRow = {
  case_id: string;
  idx: number;
  phase: Phase;
  role: Role;
  statement: string;
  statement_hash: string;
  nonce: string;
  message: string;
  digest: string;
  signature: string;
  signer: string;
  in_person: number;
  signed_at: string;
  chain_tx: string | null;
};

type StageSignatures = Partial<Record<`${Phase}:${Role}`, AttestationRow>>;

function attestationRows(caseId: string): AttestationRow[] {
  return db()
    .prepare("select * from attestations where case_id = ? order by signed_at")
    .all(caseId) as AttestationRow[];
}

function stageSignatures(rows: AttestationRow[], idx: number): StageSignatures {
  const out: StageSignatures = {};
  for (const r of rows) if (r.idx === idx) out[`${r.phase}:${r.role}`] = r;
  return out;
}

function toAttestation(r: AttestationRow): AttestationView {
  return {
    phase: r.phase,
    role: r.role,
    statement: r.statement,
    statementHash: r.statement_hash,
    message: r.message,
    digest: r.digest,
    signature: r.signature,
    signer: r.signer,
    inPerson: r.in_person === 1,
    signedAt: r.signed_at,
    chainTx: r.chain_tx,
  };
}

function signatureWindowMs(): number {
  return env.signatureWindowMinutes * 60_000;
}

function signatureDue(row: CaseRow, m: MilestoneRow, sigs: StageSignatures): SignatureDue | null {
  if (!row.signatures_required || row.status !== "funded" || m.status !== "pending") return null;
  const clinicEntry = sigs["entry:clinic"];
  const patientEntry = sigs["entry:patient"];
  const at = (r: AttestationRow) => new Date(r.signed_at).getTime();
  if (clinicEntry && !patientEntry) {
    return { kind: "no_show", due: new Date(at(clinicEntry) + signatureWindowMs()).toISOString() };
  }
  if (patientEntry && !clinicEntry) {
    return { kind: "not_started", due: new Date(at(patientEntry) + signatureWindowMs()).toISOString() };
  }
  if (patientEntry && clinicEntry) {
    const started = Math.max(at(patientEntry), at(clinicEntry));
    return { kind: "not_finished", due: new Date(started + signatureWindowMs()).toISOString() };
  }
  return null;
}

function toMilestone(row: MilestoneRow, caseRowValue?: CaseRow, attestations: AttestationRow[] = []): Milestone {
  const sigs = stageSignatures(attestations, row.idx);
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
    attestations: attestations.filter((a) => a.idx === row.idx).map(toAttestation),
    signatureDue: caseRowValue ? signatureDue(caseRowValue, row, sigs) : null,
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
  const attestations = attestationRows(id);
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
    registryCheck:
      row.registry_score === null || row.registry_cases === null
        ? null
        : { score: row.registry_score, cases: row.registry_cases },
    signaturesRequired: row.signatures_required === 1,
    milestones: ms.map((m) => toMilestone(m, row, attestations)),
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

async function requireRegisteredClinic(): Promise<registry.ClinicRecord> {
  if (!registry.registryEnabled()) {
    throw new HekimError("The clinic registry contract is not configured", 503);
  }
  const record = await registry.clinicRecord(keys.clinic().publicKey());
  if (!record) {
    throw new HekimError("This clinic is not registered in the hekim registry contract", 403);
  }
  return record;
}

export async function createCase(input: NewCase): Promise<CaseView> {
  await requireRegisteredClinic();
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
        "insert into cases (id, title, treatment, patient_name, patient_email, clinic_name, total, status, created_at, signatures_required) values (?, ?, ?, ?, ?, ?, ?, 'open', ?, 1)",
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

function createIntent(
  caseId: string,
  action: string,
  xdr: string,
  idx: number | null = null,
  note: string | null = null,
  kind: string | null = null,
) {
  db()
    .prepare(
      "insert or replace into intents (tx_hash, case_id, action, idx, note, kind, created_at) values (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(txHash(xdr), caseId, action, idx, note, kind, now());
  return signable(xdr);
}

function consumeIntent(caseId: string, action: string, signedXdr: string) {
  const hash = txHash(signedXdr);
  const row = db()
    .prepare("select * from intents where tx_hash = ? and case_id = ? and action = ?")
    .get(hash, caseId, action) as { idx: number | null; note: string | null; kind: string | null } | undefined;
  if (!row) throw new HekimError("This signature does not match a prepared action", 409);
  db().prepare("delete from intents where tx_hash = ?").run(hash);
  return { idx: row.idx, note: row.note, kind: row.kind, hash };
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
  const record = await requireRegisteredClinic();
  setCase(caseId, { registry_score: record.trustScore, registry_cases: record.cases });
  logEvent(
    caseId,
    "platform",
    "registry_checked",
    `${record.name}: trust score ${(record.trustScore / 100).toFixed(0)} over ${record.cases} closed cases`,
  );
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

export type PatientClaim = "patient" | "not_started" | "not_finished";

export async function prepareDispute(
  caseId: string,
  address: string,
  idx: number,
  note: string,
  kind: PatientClaim = "patient",
): Promise<Signable> {
  const row = caseRow(caseId);
  assertPatient(row, address);
  if (row.status !== "funded") throw new HekimError("Only a funded plan can be disputed");
  const m = milestoneRow(caseId, idx);
  if (m.status !== "pending" && m.status !== "completed") {
    throw new HekimError("This stage can no longer be disputed");
  }
  if (kind !== "patient") {
    const due = signatureDue(row, m, stageSignatures(attestationRows(caseId), idx));
    if (!due || due.kind !== kind) {
      throw new HekimError(
        kind === "not_started"
          ? "This claim needs your arrival signature and a missing clinic signature"
          : "This claim needs both arrival signatures and a missing clinic exit signature",
      );
    }
    if (Date.now() < new Date(due.due).getTime()) {
      throw new HekimError("The clinic still has time to sign");
    }
  }
  const reason = text(note, "Reason", 500);
  const xdr = await tw.dispute(row.contract_id!, idx, address);
  return createIntent(caseId, "dispute", xdr, idx, reason, kind);
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
    const kind = (intent.kind ?? "patient") as PatientClaim;
    setMilestone(caseId, idx, { status: "disputed", dispute_kind: kind, dispute_note: intent.note });
    logEvent(
      caseId,
      "patient",
      kind === "not_started" ? "not_started_reported" : kind === "not_finished" ? "not_finished_reported" : "dispute_opened",
      intent.note,
      intent.hash,
    );
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

export async function completeStage(
  caseId: string,
  idx: number,
  evidence: string,
  fromExitSignature = false,
): Promise<CaseView> {
  const row = caseRow(caseId);
  if (row.status !== "funded") throw new HekimError("The patient has not funded this plan yet");
  if (row.signatures_required && !fromExitSignature) {
    throw new HekimError("This plan uses dual signatures: complete the stage with the clinic's exit signature");
  }
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
  } else if (row.signatures_required) {
    const due = signatureDue(row, m, stageSignatures(attestationRows(caseId), idx));
    if (!due || due.kind !== "no_show") {
      throw new HekimError("A no-show needs the clinic's arrival signature and a missing patient signature");
    }
    if (Date.now() < new Date(due.due).getTime()) {
      throw new HekimError("The patient still has time to sign in");
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

export async function createDemoCase(email: string, name: string): Promise<CaseView> {
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

const CHECKIN_MINUTES = 10;
const SIGN_REQUEST_MINUTES = 15;

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sep53Digest(message: string): Buffer {
  return createHash("sha256").update(SEP53_PREFIX + message).digest();
}

function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function requireSignedPlan(row: CaseRow) {
  if (!row.signatures_required) throw new HekimError("This plan was created before dual signatures");
  if (row.status !== "funded") throw new HekimError("The plan is not funded");
}

function requirePreviousSettled(caseId: string, idx: number) {
  const ms = milestoneRows(caseId);
  if (ms.slice(0, idx).some((p) => p.status !== "released" && p.status !== "resolved")) {
    throw new HekimError("Finish the previous stage first");
  }
}

function saveAttestation(input: {
  caseId: string;
  idx: number;
  phase: Phase;
  role: Role;
  statement: string;
  nonce: string;
  message: string;
  digest: Buffer;
  signature: Buffer;
  signer: string;
  inPerson: boolean;
}) {
  db()
    .prepare(
      "insert into attestations (case_id, idx, phase, role, statement, statement_hash, nonce, message, digest, signature, signer, in_person, signed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.caseId,
      input.idx,
      input.phase,
      input.role,
      input.statement,
      sha256Hex(input.statement),
      input.nonce,
      input.message,
      input.digest.toString("hex"),
      input.signature.toString("base64"),
      input.signer,
      input.inPerson ? 1 : 0,
      now(),
    );
}

async function anchorAttestation(
  caseId: string,
  idx: number,
  phase: Phase,
  role: Role,
  signer: string,
  digest: Buffer,
  signature: Buffer,
) {
  if (!registry.registryEnabled()) return;
  try {
    const result = await registry.attest({
      caseId,
      stage: idx,
      phase: PHASE_CODE[phase],
      role: ROLE_CODE[role],
      signer: Buffer.from(Keypair.fromPublicKey(signer).rawPublicKey()),
      digest,
      signature,
    });
    db()
      .prepare("update attestations set chain_tx = ? where case_id = ? and idx = ? and phase = ? and role = ?")
      .run(result.hash, caseId, idx, phase, role);
    logEvent(caseId, "platform", "attestation_anchored", `${role} ${phase} signature, stage ${idx + 1}`, result.hash);
  } catch (error) {
    logEvent(caseId, "platform", "registry_failed", error instanceof Error ? error.message : String(error));
  }
}

function issueCheckin(caseId: string, idx: number): { nonce: string; expiresAt: string } {
  db()
    .prepare(
      "delete from sign_intents where case_id = ? and idx = ? and role = 'patient' and phase = 'entry' and in_person = 1",
    )
    .run(caseId, idx);
  const nonce = randomBytes(12).toString("hex");
  const expiresAt = inMinutes(CHECKIN_MINUTES);
  db()
    .prepare(
      "insert into sign_intents (nonce, case_id, idx, phase, role, statement, in_person, expires_at, created_at) values (?, ?, ?, 'entry', 'patient', '', 1, ?, ?)",
    )
    .run(nonce, caseId, idx, expiresAt, now());
  return { nonce, expiresAt };
}

export async function clinicSign(
  caseId: string,
  idx: number,
  phase: Phase,
  statementInput: string,
): Promise<{ case: CaseView; checkin: { nonce: string; expiresAt: string } | null }> {
  const row = caseRow(caseId);
  requireSignedPlan(row);
  const m = milestoneRow(caseId, idx);
  if (m.status !== "pending") throw new HekimError("This stage is not open");
  requirePreviousSettled(caseId, idx);
  const sigs = stageSignatures(attestationRows(caseId), idx);
  if (sigs[`${phase}:clinic`]) throw new HekimError("The clinic has already signed this");
  if (phase === "exit" && (!sigs["entry:clinic"] || !sigs["entry:patient"])) {
    throw new HekimError("Both arrival signatures are needed before the stage can be completed");
  }
  const statement = text(statementInput, phase === "entry" ? "Scope" : "Work done", 500);
  const clinic = keys.clinic();
  const nonce = randomBytes(12).toString("hex");
  const message = attestMessage({
    caseId,
    stage: idx,
    phase,
    role: "clinic",
    statementHash: sha256Hex(statement),
    at: now(),
    nonce,
  });
  const digest = sep53Digest(message);
  const signature = Buffer.from(clinic.sign(digest));
  saveAttestation({
    caseId,
    idx,
    phase,
    role: "clinic",
    statement,
    nonce,
    message,
    digest,
    signature,
    signer: clinic.publicKey(),
    inPerson: false,
  });
  logEvent(caseId, "clinic", phase === "entry" ? "entry_signed" : "exit_signed", `${m.title}: ${statement}`);
  await anchorAttestation(caseId, idx, phase, "clinic", clinic.publicKey(), digest, signature);
  let checkin: { nonce: string; expiresAt: string } | null = null;
  if (phase === "entry" && !sigs["entry:patient"]) checkin = issueCheckin(caseId, idx);
  if (phase === "exit") await completeStage(caseId, idx, statement, true);
  return { case: getCase(caseId), checkin };
}

export function clinicCheckin(caseId: string, idx: number): { nonce: string; expiresAt: string } {
  const row = caseRow(caseId);
  requireSignedPlan(row);
  const m = milestoneRow(caseId, idx);
  const sigs = stageSignatures(attestationRows(caseId), idx);
  if (m.status !== "pending" || !sigs["entry:clinic"] || sigs["entry:patient"]) {
    throw new HekimError("There is no arrival waiting for this stage");
  }
  return issueCheckin(caseId, idx);
}

export async function preparePatientSign(
  caseId: string,
  address: string,
  idx: number,
  phase: Phase,
  checkin: string | null,
): Promise<SignRequest> {
  const row = caseRow(caseId);
  assertPatient(row, address);
  requireSignedPlan(row);
  const m = milestoneRow(caseId, idx);
  const sigs = stageSignatures(attestationRows(caseId), idx);
  if (sigs[`${phase}:patient`]) throw new HekimError("You have already signed this");
  let statement: string;
  if (phase === "entry") {
    if (m.status !== "pending") throw new HekimError("This stage is not open");
    requirePreviousSettled(caseId, idx);
    const scope = sigs["entry:clinic"]?.statement ?? "the clinic has not signed its scope yet";
    statement = patientEntryStatement(row.clinic_name, idx, m.title, scope);
  } else {
    if (!sigs["exit:clinic"]) throw new HekimError("The clinic has not signed this stage as done yet");
    statement = patientExitStatement(idx, m.title);
  }
  let nonce: string;
  let inPerson = false;
  if (phase === "entry" && checkin) {
    const intent = db()
      .prepare(
        "select * from sign_intents where nonce = ? and case_id = ? and idx = ? and role = 'patient' and phase = 'entry' and in_person = 1",
      )
      .get(checkin, caseId, idx) as { expires_at: string } | undefined;
    if (!intent || new Date(intent.expires_at).getTime() < Date.now()) {
      throw new HekimError("This check-in code has expired. Ask the clinic to show a new one.", 410);
    }
    nonce = checkin;
    inPerson = true;
  } else {
    nonce = randomBytes(12).toString("hex");
  }
  const message = attestMessage({
    caseId,
    stage: idx,
    phase,
    role: "patient",
    statementHash: sha256Hex(statement),
    at: now(),
    nonce,
  });
  const digest = sep53Digest(message).toString("hex");
  db()
    .prepare(
      "insert into sign_intents (nonce, case_id, idx, phase, role, statement, message, digest, in_person, expires_at, created_at) values (?, ?, ?, ?, 'patient', ?, ?, ?, ?, ?, ?) on conflict(nonce) do update set statement = excluded.statement, message = excluded.message, digest = excluded.digest, expires_at = excluded.expires_at",
    )
    .run(nonce, caseId, idx, phase, statement, message, digest, inPerson ? 1 : 0, inMinutes(SIGN_REQUEST_MINUTES), now());
  return { nonce, statement, message, digest, inPerson };
}

function decodeSignature(value: string): Buffer {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{128}$/.test(hex)) return Buffer.from(hex, "hex");
  const buf = Buffer.from(trimmed, "base64");
  if (buf.length !== 64) throw new HekimError("Invalid signature");
  return buf;
}

export async function submitPatientSign(
  caseId: string,
  address: string,
  nonce: string,
  signatureValue: string,
): Promise<CaseView> {
  const row = caseRow(caseId);
  assertPatient(row, address);
  requireSignedPlan(row);
  const intent = db()
    .prepare("select * from sign_intents where nonce = ? and case_id = ? and role = 'patient'")
    .get(nonce, caseId) as
    | {
        idx: number;
        phase: Phase;
        statement: string;
        message: string | null;
        digest: string | null;
        in_person: number;
        expires_at: string;
      }
    | undefined;
  if (!intent || !intent.message || !intent.digest) throw new HekimError("This signature request was not found", 404);
  if (new Date(intent.expires_at).getTime() < Date.now()) {
    throw new HekimError("This signature request has expired, start again", 410);
  }
  const digest = Buffer.from(intent.digest, "hex");
  if (!sep53Digest(intent.message).equals(digest)) throw new HekimError("Signature request is corrupted", 500);
  const signature = decodeSignature(signatureValue);
  if (!Keypair.fromPublicKey(row.patient_address!).verify(digest, signature)) {
    throw new HekimError("The signature does not match this plan's patient wallet", 400);
  }
  const sigs = stageSignatures(attestationRows(caseId), intent.idx);
  if (sigs[`${intent.phase}:patient`]) throw new HekimError("You have already signed this");
  saveAttestation({
    caseId,
    idx: intent.idx,
    phase: intent.phase,
    role: "patient",
    statement: intent.statement,
    nonce,
    message: intent.message,
    digest,
    signature,
    signer: row.patient_address!,
    inPerson: intent.in_person === 1,
  });
  db().prepare("delete from sign_intents where nonce = ?").run(nonce);
  logEvent(
    caseId,
    "patient",
    intent.phase === "entry" ? "entry_signed" : "exit_signed",
    intent.phase === "entry"
      ? intent.in_person === 1
        ? "in person, clinic check-in code"
        : "self-declared arrival"
      : intent.statement,
  );
  await anchorAttestation(caseId, intent.idx, intent.phase, "patient", row.patient_address!, digest, signature);
  return getCase(caseId);
}
