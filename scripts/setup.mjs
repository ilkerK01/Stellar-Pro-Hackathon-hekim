import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

const ENV_FILE = ".env.local";
const PASSPHRASE = "Test SDF Network ; September 2015";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");

function readEnv() {
  const values = {};
  if (!existsSync(ENV_FILE)) return values;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

function writeEnv(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  writeFileSync(ENV_FILE, `${lines.join("\n")}\n`);
}

async function exists(address) {
  try {
    await horizon.loadAccount(address);
    return true;
  } catch {
    return false;
  }
}

async function fund(address) {
  if (await exists(address)) return;
  await fetch(`https://friendbot.stellar.org?addr=${address}`);
  for (let i = 0; i < 10 && !(await exists(address)); i++) {
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function trustline(keypair) {
  const account = await horizon.loadAccount(keypair.publicKey());
  const has = account.balances.some(
    (b) => b.asset_code === USDC.code && b.asset_issuer === USDC.issuer,
  );
  if (has) return;
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(120)
    .build();
  tx.sign(keypair);
  await horizon.submitTransaction(tx);
}

async function registerClinic(contractId, platform, clinic, name, country) {
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const contract = new Contract(contractId);
  const account = await server.getAccount(platform.publicKey());
  const readTx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(contract.call("clinic", nativeToScVal(clinic, { type: "address" })))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(readTx);
  if (sim.result?.retval && scValToNative(sim.result.retval) != null) {
    console.log("Clinic already in registry");
    return;
  }
  const fresh = await server.getAccount(platform.publicKey());
  const tx = new TransactionBuilder(fresh, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(
      contract.call(
        "register_clinic",
        nativeToScVal(clinic, { type: "address" }),
        nativeToScVal(name, { type: "string" }),
        nativeToScVal(country, { type: "string" }),
      ),
    )
    .setTimeout(120)
    .build();
  const prepared = await server.prepareTransaction(tx);
  prepared.sign(platform);
  const sent = await server.sendTransaction(prepared);
  for (let i = 0; i < 30; i++) {
    const res = await server.getTransaction(sent.hash);
    if (res.status === "SUCCESS") {
      console.log(`Clinic registered on chain: ${sent.hash}`);
      return;
    }
    if (res.status === "FAILED") throw new Error("register_clinic failed");
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const env = readEnv();
for (const role of ["PLATFORM", "CLINIC", "ARBITER"]) {
  if (!env[`${role}_SECRET`]) env[`${role}_SECRET`] = Keypair.random().secret();
}
env.APPROVAL_WINDOW_MINUTES ??= "2";
env.PLATFORM_FEE_PERCENT ??= "1";
env.TW_PROTOCOL_FEE_PERCENT ??= "0.3";
env.CLINIC_NAME ??= "Bosphorus Dental & Aesthetics";
env.CLINIC_COUNTRY ??= "TR";
env.TW_API_KEY ??= "";
env.NEXT_PUBLIC_PRIVY_APP_ID ??= "";
env.REGISTRY_CONTRACT_ID ??= "";
writeEnv(env);

const platform = Keypair.fromSecret(env.PLATFORM_SECRET);
const clinic = Keypair.fromSecret(env.CLINIC_SECRET);
const arbiter = Keypair.fromSecret(env.ARBITER_SECRET);

for (const [name, kp] of [["platform", platform], ["clinic", clinic], ["arbiter", arbiter]]) {
  await fund(kp.publicKey());
  console.log(`${name.padEnd(8)} ${kp.publicKey()}`);
}
await trustline(platform);
await trustline(clinic);
console.log("USDC trustlines ready for platform and clinic");

if (env.REGISTRY_CONTRACT_ID) {
  await registerClinic(env.REGISTRY_CONTRACT_ID, platform, clinic.publicKey(), env.CLINIC_NAME, env.CLINIC_COUNTRY);
} else {
  console.log(
    `Deploy the registry next:\n  stellar contract deploy --wasm hekim_registry.wasm --source-account <PLATFORM_SECRET> --network testnet -- --admin ${platform.publicKey()}\nthen set REGISTRY_CONTRACT_ID in ${ENV_FILE} and run this script again.`,
  );
}
