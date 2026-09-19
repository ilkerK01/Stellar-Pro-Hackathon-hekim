# hekim technical notes

## Components

| Path | Role |
|---|---|
| `src/lib/server/hekim.ts` | Business rules: cases, stages, approval window, claims, arbiter decisions, registry hooks, ramps |
| `src/lib/server/trustless.ts` | Trustless Work REST client. Every write returns an unsigned XDR that the role holder signs and `/helper/send-transaction` submits |
| `src/lib/server/anchor.ts` | SEP-10 challenge and token exchange, SEP-6 deposit, withdraw, transaction status, sandbox bank simulation |
| `src/lib/server/registry.ts` | Soroban RPC client for the registry contract: `prepareTransaction`, `sendTransaction`, `getTransaction` polling, read-only simulation |
| `src/lib/server/stellar.ts` | Horizon helpers: Friendbot, balances, USDC trustline, payments with memo, XDR signing |
| `src/lib/server/db.ts` | `node:sqlite` single-file store for plan text, stage state, activity log, ramps, intents and anchor tokens |
| `src/app/api/*` | Route handlers: `cases`, `cases/[id]`, `demo`, `disputes`, `wallet/[address]`, `anchor`, `clinic`, `config` |
| `src/components/patient/wallet.tsx` | Privy provider, Stellar embedded wallet creation, transaction signing |
| `contracts/registry` | Soroban registry contract and tests |
| `scripts/setup.mjs` | Creates and funds the demo accounts, opens trustlines, registers the demo clinic |

## Roles in each escrow

| Trustless Work role | Account | Why |
|---|---|---|
| approver | patient (Privy wallet) | only the patient can approve a stage |
| serviceProvider | clinic | reports stages, can raise a dispute (no-show, no response) |
| milestone receiver | clinic | receives released stages |
| releaseSigner | platform | releases right after the patient's approval, so the clinic cannot pull money |
| disputeResolver | arbiter | the only account that can split a disputed stage |
| platformAddress | platform | receives the 1% platform fee |

The escrow is a multi-release contract with one milestone per stage, so each stage has its own approval, release and dispute state.

## Signing flow for the patient

1. The browser asks a route handler to prepare an action (`prepare-fund`, `prepare-approve`, `prepare-dispute`).
2. The server calls Trustless Work, receives the unsigned XDR, stores its hash as an *intent* (case, action, stage, note) and returns the XDR.
3. The browser computes the transaction hash, signs it with Privy's `signRawHash` on the Stellar curve, and attaches the signature with `addSignature`.
4. The server accepts the signed XDR only if its hash matches a stored intent for that case and action, submits it, and updates the stage.

The same pattern signs the USDC trustline and the SEP-10 challenge. The trustline endpoint only accepts a single `changeTrust` for USDC from the patient's own account.

## Money math

All amounts are handled as integers in stroops (`bigint`, 7 decimals). Stage amounts are rounded down to 0.01 USDC and the remainder goes to the last stage, so stages always add up to the plan total. Dispute distributions must equal the stage amount minus fees, so the arbiter split is computed on `amount × (1 − 1% − 0.3%)` and the clinic's share is the exact remainder.

## Design decisions and trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| Trustless Work for escrow instead of a custom escrow contract | Audited, maintained multi-release escrow with dispute resolution. Our own code focuses on what is specific to medical travel | Dependency on an external API and its rate limit (50 requests per minute) |
| Own Soroban registry next to the escrow | Escrow proves one case was fair; the registry makes behaviour across cases public and tamper-proof, which is what a new patient needs before paying | Admin-written: the platform attests outcomes. Mitigated because every entry is a public transaction and every stage outcome is also visible in the escrow contract |
| Evidence hashes, not evidence | Health data must stay off chain (KVKK, GDPR). A hash proves the note was not edited after the fact | Verifying needs the original note from the clinic or patient |
| Privy embedded wallet for patients | Patients are not crypto users; email sign-in with no seed phrase | Key custody sits with Privy's infrastructure |
| Server-held keys for clinic, arbiter and platform | Hackathon scope: one demo clinic and one arbiter | Production needs per-clinic wallets and a multisig arbiter panel |
| Platform as release signer | Release happens immediately after the patient's approval; the clinic cannot trigger payment on its own | The platform must stay online to release; a retry button covers failures |
| Approval window and no-show in app logic, enforced through disputes | Trustless Work has no timers; a claim opens a dispute signed by the clinic, and only the arbiter moves money | Deadlines are checked off chain |
| SEP-6 instead of SEP-24 | The event anchor speaks SEP-6; the app builds its own deposit and withdraw UI | Each new anchor must support SEP-6 |
| SQLite | Single file, zero setup for judges | Single instance; would move to Postgres |
| Intent table for patient signatures | The server never trusts an arbitrary signed XDR: it must match a transaction the server prepared for that case and action | One more table to keep in sync |

## Limits we know about

- The mock anchor accepts 50 to 3,000 TRY per deposit and at least 1 USDC per withdrawal.
- Trustless Work testnet uses Circle testnet USDC, which is also the anchor's asset, so no swap is needed.
- Patient identity is the Privy email plus the wallet that accepted the plan; the server does not verify a Privy access token yet.
- Clinic and arbiter desks have no login in the demo.
