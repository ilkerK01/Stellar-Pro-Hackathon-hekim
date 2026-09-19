import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env";

const schema = `
create table if not exists cases (
  id text primary key,
  title text not null,
  treatment text not null,
  patient_name text not null,
  patient_email text not null,
  clinic_name text not null,
  total text not null,
  status text not null,
  patient_address text,
  contract_id text,
  created_at text not null,
  accepted_at text,
  funded_at text,
  registry_tx text
);
create table if not exists milestones (
  case_id text not null,
  idx integer not null,
  title text not null,
  amount text not null,
  status text not null,
  evidence text,
  completed_at text,
  dispute_kind text,
  dispute_note text,
  patient_share integer,
  evidence_hash text,
  evidence_tx text,
  primary key (case_id, idx)
);
create table if not exists events (
  id integer primary key autoincrement,
  case_id text not null,
  actor text not null,
  kind text not null,
  detail text,
  tx_hash text,
  created_at text not null
);
create table if not exists ramps (
  id text primary key,
  case_id text,
  party text not null,
  account text not null,
  kind text not null,
  amount_in text not null,
  amount_out text,
  status text not null,
  payment_hash text,
  created_at text not null,
  updated_at text not null
);
create table if not exists intents (
  tx_hash text primary key,
  case_id text not null,
  action text not null,
  idx integer,
  note text,
  created_at text not null
);
create table if not exists attestations (
  case_id text not null,
  idx integer not null,
  phase text not null,
  role text not null,
  statement text not null,
  statement_hash text not null,
  nonce text not null,
  message text not null,
  digest text not null,
  signature text not null,
  signer text not null,
  in_person integer not null default 0,
  signed_at text not null,
  chain_tx text,
  primary key (case_id, idx, phase, role)
);
create table if not exists sign_intents (
  nonce text primary key,
  case_id text not null,
  idx integer not null,
  phase text not null,
  role text not null,
  statement text not null,
  message text,
  digest text,
  in_person integer not null default 0,
  expires_at text not null,
  created_at text not null
);
create table if not exists anchor_tokens (
  account text primary key,
  token text not null,
  expires_at integer not null
);
`;

const globalForDb = globalThis as unknown as { hekimDb?: DatabaseSync };

function open(): DatabaseSync {
  mkdirSync(dirname(env.dbPath), { recursive: true });
  const db = new DatabaseSync(env.dbPath);
  db.exec("pragma journal_mode = wal;");
  db.exec(schema);
  const columns = (db.prepare("pragma table_info(cases)").all() as { name: string }[]).map((c) => c.name);
  if (!columns.includes("registry_score")) db.exec("alter table cases add column registry_score integer");
  if (!columns.includes("registry_cases")) db.exec("alter table cases add column registry_cases integer");
  if (!columns.includes("signatures_required")) {
    db.exec("alter table cases add column signatures_required integer not null default 0");
  }
  const intentColumns = (db.prepare("pragma table_info(intents)").all() as { name: string }[]).map((c) => c.name);
  if (!intentColumns.includes("kind")) db.exec("alter table intents add column kind text");
  return db;
}

export function db(): DatabaseSync {
  if (!globalForDb.hekimDb) globalForDb.hekimDb = open();
  return globalForDb.hekimDb;
}

export function now(): string {
  return new Date().toISOString();
}
