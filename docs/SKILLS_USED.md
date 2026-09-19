# Stellar skills used

We used these skill files from [skills.stellar.org](https://skills.stellar.org) while building hekim, then audited the code against them. Each entry lists the exact file and what it changed in this repository.

| Skill file | Where it shows up in the code | What it changed |
|---|---|---|
| [`skills/smart-contracts/SKILL.md`](https://skills.stellar.org/skills/smart-contracts/SKILL.md) | `contracts/registry/src/lib.rs`, `contracts/Cargo.toml` | `__constructor` for one-shot admin setup instead of an `initialize` function, `#[contractevent]` events, release profile with `overflow-checks`, `opt-level = "z"`, `lto` |
| [`skills/smart-contracts/development.md`](https://skills.stellar.org/skills/smart-contracts/development.md) | `contracts/registry/src/lib.rs` | Admin in instance storage, clinic, case and evidence records in persistent storage, TTL extended on every write, clinic address and case id as event topics, nothing personal stored on chain |
| [`skills/smart-contracts/security.md`](https://skills.stellar.org/skills/smart-contracts/security.md) | `contracts/registry/src/lib.rs`, `src/components/patient/wallet.tsx` | `require_auth` on the stored admin, `checked_add` with a typed error, write-once guards; the browser refuses to sign for any network other than testnet |
| [`skills/smart-contracts/testing.md`](https://skills.stellar.org/skills/smart-contracts/testing.md) | `contracts/registry/src/test.rs` | Tests assert the recorded auth tree (`env.auths()`) and the published event topics, not only return values |
| [`skills/dapp/SKILL.md`](https://skills.stellar.org/skills/dapp/SKILL.md) | `src/lib/server/registry.ts` | `prepareTransaction` before signing, `pollTransaction` with enough attempts for the 120-second timeout, retry on `TRY_AGAIN_LATER` |
| [`skills/standards/SKILL.md`](https://skills.stellar.org/skills/standards/SKILL.md) | `src/lib/server/anchor.ts`, `.github/workflows/release.yml` | SEP-6 (API-first) instead of SEP-24 because we build our own deposit and withdraw UI; SEP-10 for wallet login; SEP-31 noted for future corridors; SEP-55 build verification through the Stellar Expert release workflow; CAP-58 constructors and CAP-53 TTL behaviour in the contract |
| [`CheesecakeLabs/stellar-anchor-skill`](https://raw.githubusercontent.com/CheesecakeLabs/stellar-anchor-skill/main/SKILL.md) | `src/lib/server/anchor.ts`, `src/lib/server/hekim.ts` | The SEP-10 challenge is validated with `WebAuth.readChallengeTx` against `SIGNING_KEY` from `stellar.toml` before any server key signs it; the JWT `sub` must match the account; tokens are dropped and re-issued on 401; withdraw memos honour `memo_type`; amounts are exact decimal strings |
| [`Trustless-Work/trustlesswork-skill`](https://raw.githubusercontent.com/Trustless-Work/trustlesswork-skill/main/trustless-work-dev/SKILL.md) | `src/lib/server/trustless.ts`, `src/lib/server/hekim.ts` | Multi-release payloads (`milestoneIndex` as a string, per-milestone `receiver`, `amount` as a number), one role per key, dispute distributions that never exceed the milestone after fees |

## Audit findings that came from these files

| Finding | Source | Fixed in |
|---|---|---|
| The server-held clinic key signed SEP-10 challenges without validating them | anchor skill, pitfall 1 | `anchor.ts` `challenge()` |
| Anchor tokens could be stored under an address other than the JWT subject | anchor skill | `anchor.ts` `exchange()` |
| Plan titles and evidence notes were written into escrow fields | development.md, no personal data on chain | `hekim.ts` `acceptCase()`, `completeStage()` |
| Registry totals used plain `+=` | security.md, checked arithmetic | `lib.rs` `record_case()` |
| RPC sends did not handle `TRY_AGAIN_LATER` and polled for too short | dapp skill | `registry.ts` `invoke()` |
| Tests did not check auth or events | testing.md | `test.rs` |
