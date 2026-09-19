import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";

const BASE = process.env.BASE ?? "http://localhost:3000";
const EMAIL = process.env.EMAIL ?? "smoke@hekim.test";
const KEY_FILE = "data/e2e-patient.key";
const steps = (process.argv[2] ?? "wallet,topup,happy,registry").split(",");

mkdirSync("data", { recursive: true });
const patient = existsSync(KEY_FILE)
  ? Keypair.fromSecret(readFileSync(KEY_FILE, "utf8").trim())
  : Keypair.random();
writeFileSync(KEY_FILE, patient.secret());
const address = patient.publicKey();

async function call(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${data.error}`);
  return data;
}

function sign(signable) {
  const tx = TransactionBuilder.fromXDR(signable.xdr, signable.networkPassphrase);
  const sig = patient.sign(tx.hash());
  tx.addSignature(address, Buffer.from(sig).toString("base64"));
  return tx.toXDR();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function expect(ok, message) {
  if (!ok) throw new Error(`Check failed: ${message}`);
}

function summary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`, { flag: "a" });
}

const code = (value) => "`" + value + "`";
const tx = (hash) => `[${code(`${hash.slice(0, 10)}…`)}](https://stellar.expert/explorer/testnet/tx/${hash})`;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

log("patient", address);
summary("| Step | Result |\n|---|---|");

if (steps.includes("wallet")) {
  const res = await call(`/api/wallet/${address}`, { action: "activate" });
  if (res.signable) {
    const r = await call(`/api/wallet/${address}`, { action: "trustline", signedXdr: sign(res.signable) });
    log("trustline", r.hash);
  }
  const w = (await call(`/api/wallet/${address}`)).wallet;
  log("wallet", JSON.stringify(w));
  expect(w.exists && w.usdc !== null, "patient wallet activated with a USDC trustline");
  summary(`| Wallet activated with USDC trustline | ${address.slice(0, 8)}… |`);
}

if (steps.includes("topup")) {
  const { signable } = await call("/api/anchor", { action: "challenge", address });
  await call("/api/anchor", { action: "token", address, signedXdr: sign(signable) });
  log("sep10 ok");
  const amountTry = process.env.TRY ?? "400";
  const dep = await call("/api/anchor", { action: "deposit", address, amountTry, caseId: process.env.CASE ?? null });
  log("deposit", dep.ramp.id, JSON.stringify(dep.instructions.instructions ?? dep.instructions.how ?? {}));
  let ramp = (await call("/api/anchor", { action: "simulate", address, rampId: dep.ramp.id })).ramp;
  for (let i = 0; i < 30 && ramp.status !== "completed"; i++) {
    await wait(3000);
    ramp = (await call("/api/anchor", { action: "refresh", address, rampId: dep.ramp.id })).ramp;
    log("ramp", ramp.status, ramp.amountOut ?? "");
  }
  expect(ramp.status === "completed", "SEP-6 deposit completed");
  summary(`| SEP-10 login and SEP-6 deposit | ${amountTry} TRY became ${Number(ramp.amountOut).toFixed(4)} USDC |`);
  log("wallet", JSON.stringify((await call(`/api/wallet/${address}`)).wallet));
}

async function stage(caseId, action, idx, extra = {}) {
  return (await call(`/api/cases/${caseId}`, { action, idx, ...extra })).case;
}

async function patientSigned(caseId, prepare, kind) {
  const { signable } = await call(`/api/cases/${caseId}`, { ...prepare, address });
  return (await call(`/api/cases/${caseId}`, { action: "submit", kind, address, signedXdr: sign(signable) })).case;
}

function show(c) {
  log(c.id, c.status, c.milestones.map((m) => `${m.idx}:${m.status}`).join(" "), `locked=${c.locked} released=${c.released} refunded=${c.refunded}`);
}

if (steps.includes("happy")) {
  let c = (await call("/api/demo", { email: EMAIL, name: "Smoke Patient" })).case;
  log("case", c.id);
  c = (await call(`/api/cases/${c.id}`, { action: "accept", address, email: EMAIL })).case;
  log("escrow", c.contractId);
  c = await patientSigned(c.id, { action: "prepare-fund" }, "fund");
  show(c);
  c = await stage(c.id, "complete", 0, { evidence: "Patient arrived, panoramic x-ray taken, file 118." });
  show(c);
  c = await patientSigned(c.id, { action: "prepare-approve", idx: 0 }, "approve");
  show(c);
  c = await stage(c.id, "complete", 1, { evidence: "Two implants placed at 36 and 46, no complications." });
  c = await patientSigned(c.id, { action: "prepare-dispute", idx: 1, note: "Only one implant was placed, not two." }, "dispute");
  show(c);
  c = await stage(c.id, "resolve", 1, { patientPercent: 50, refundRest: false });
  show(c);
  c = await stage(c.id, "complete", 2, { evidence: "Day 7 check-up done, healing normal." });
  c = await patientSigned(c.id, { action: "prepare-approve", idx: 2 }, "approve");
  show(c);
  for (const e of c.events.slice().reverse()) log(" ", e.actor, e.kind, e.txHash ?? "");
  expect(c.status === "closed", "happy path case closed");
  expect(Number(c.released) > 0 && Number(c.refunded) > 0, "released to clinic and refunded to patient after the split");
  expect(Boolean(c.registryTx), "outcome recorded in the registry contract");
  summary(`| Escrow for ${c.id} | [\`${c.contractId.slice(0, 10)}…\`](https://stellar.expert/explorer/testnet/contract/${c.contractId}) |`);
  for (const e of c.events.slice().reverse()) if (e.txHash) summary(`| ${e.actor}: ${e.kind.replaceAll("_", " ")} | ${tx(e.txHash)} |`);
}

if (steps.includes("clean")) {
  let c = (await call("/api/demo", { email: EMAIL, name: "Clean Patient" })).case;
  c = (await call(`/api/cases/${c.id}`, { action: "accept", address, email: EMAIL })).case;
  c = await patientSigned(c.id, { action: "prepare-fund" }, "fund");
  for (const idx of [0, 1, 2]) {
    c = await stage(c.id, "complete", idx, { evidence: `Stage ${idx + 1} done as planned.` });
    c = await patientSigned(c.id, { action: "prepare-approve", idx }, "approve");
  }
  show(c);
  expect(c.status === "closed" && Number(c.refunded) === 0 && Boolean(c.registryTx), "clean case closed without refunds and recorded");
  summary(`| Clean case ${c.id}, no dispute | recorded ${tx(c.registryTx)} |`);
}

if (steps.includes("noshow")) {
  let c = (await call("/api/demo", { email: EMAIL, name: "No-show Patient" })).case;
  c = (await call(`/api/cases/${c.id}`, { action: "accept", address, email: EMAIL })).case;
  c = await patientSigned(c.id, { action: "prepare-fund" }, "fund");
  c = await stage(c.id, "claim", 0, { kind: "no_show", note: "Patient did not arrive, transfer and hotel were booked." });
  show(c);
  c = await stage(c.id, "resolve", 0, { patientPercent: 50, refundRest: true });
  show(c);
  for (const e of c.events.slice().reverse()) log(" ", e.actor, e.kind, e.txHash ?? "");
  expect(c.status === "closed" && Number(c.refunded) > Number(c.released), "no-show case refunded the rest of the plan");
  summary(`| No-show ${c.id} | ${c.refunded} USDC back to the patient, ${c.released} USDC to the clinic |`);
}

if (steps.includes("noresponse")) {
  let c = (await call("/api/demo", { email: EMAIL, name: "Silent Patient" })).case;
  c = (await call(`/api/cases/${c.id}`, { action: "accept", address, email: EMAIL })).case;
  c = await patientSigned(c.id, { action: "prepare-fund" }, "fund");
  c = await stage(c.id, "complete", 0, { evidence: "Examination done." });
  let early = false;
  try {
    await stage(c.id, "claim", 0, { kind: "no_response", note: "Too early" });
    early = true;
  } catch (e) {
    log("early claim rejected:", e.message);
  }
  expect(!early, "a no-response claim before the window ends is rejected");
  const due = new Date(c.milestones[0].approvalDue).getTime();
  log("waiting until", c.milestones[0].approvalDue);
  await wait(Math.max(0, due - Date.now()) + 3000);
  c = await stage(c.id, "claim", 0, { kind: "no_response", note: "No answer from patient in 72h." });
  c = await stage(c.id, "resolve", 0, { patientPercent: 0, refundRest: true });
  show(c);
  expect(c.status === "closed", "no-response case closed by the arbiter");
  summary(`| No response ${c.id} | early claim rejected, claim after the window accepted, case closed |`);
}

if (steps.includes("payout")) {
  const r = (await call("/api/clinic", { action: "withdraw", amount: process.env.USDC ?? "2" })).ramp;
  log("payout", r.id, r.status, r.paymentHash);
  let ramp = r;
  for (let i = 0; i < 30 && ramp.status !== "completed"; i++) {
    await wait(3000);
    ramp = (await call("/api/clinic", { action: "refresh", rampId: r.id })).ramp;
    log("payout", ramp.status, ramp.amountOut ?? "");
  }
  expect(ramp.status === "completed", "SEP-6 withdrawal completed");
  summary(`| Clinic cash-out, SEP-6 withdraw | ${ramp.amountIn} USDC became ${ramp.amountOut} TRY, ${tx(r.paymentHash)} |`);
}

if (steps.includes("registry")) {
  const cfg = await call("/api/config");
  log("registry", JSON.stringify(cfg.clinic.record));
  expect(cfg.clinic.record && cfg.clinic.record.cases > 0, "registry reports closed cases for the clinic");
  summary(`| Registry contract | [\`${cfg.clinic.registryContractId.slice(0, 10)}…\`](https://stellar.expert/explorer/testnet/contract/${cfg.clinic.registryContractId}), ${cfg.clinic.record.cases} closed case(s), trust score ${cfg.clinic.record.trustScore / 100} |`);
}
