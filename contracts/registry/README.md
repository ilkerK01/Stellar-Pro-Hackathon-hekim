# hekim registry contract

A Soroban contract that keeps a public, append-only track record for every clinic on hekim.

Escrow itself runs on Trustless Work multi-release contracts. This contract answers the question the escrow cannot: *how has this clinic behaved with previous patients?*

- Testnet contract: `CCOGNY4Q3APUUPZ4BNLQBDZE5FHHJNW2DJARQLWVJMWBMHPXTMYG2UZ3`
- Admin: the hekim platform account. Only the admin can write. Anyone can read.
- SDK: `soroban-sdk` 28

## Data

| Key | Storage | Value |
|---|---|---|
| `Admin` | instance | platform address, set once in the constructor |
| `Clinic(Address)` | persistent | name, country, registration time, case counters, volume, released and refunded totals |
| `Case(String)` | persistent | clinic, amount, released, refunded, number of disputes, outcome, evidence root, close time |
| `Evidence(String, u32)` | persistent | SHA-256 of a stage's evidence note and the ledger time it was anchored |

Amounts are `i128` in stroops (7 decimals, USDC). Every write extends the TTL of the entries it touched and of the instance to about 120 days.

## Functions

| Function | Auth | What it does |
|---|---|---|
| `__constructor(admin)` | deployer | stores the admin |
| `register_clinic(clinic, name, country)` | admin | creates a clinic record, fails if it exists |
| `anchor_evidence(case_id, stage, hash)` | admin | stores the hash of a stage's evidence note once; the note itself never goes on chain |
| `record_case(case_id, clinic, amount, released, refunded, disputes, evidence_root)` | admin | writes the outcome of a closed case once and updates the clinic's counters, returns the `Outcome` |
| `clinic(clinic)` | none | clinic record or `None` |
| `case(case_id)` | none | case record or `None` |
| `evidence(case_id, stage)` | none | evidence hash or `None` |
| `trust_score(clinic)` | none | share of closed cases without any dispute, in basis points (0 to 10000) |
| `admin()` | none | admin address |

`Outcome` is `Completed` (no dispute), `Arbitrated` (an arbiter split at least one stage and the clinic still received money) or `Refunded` (a dispute ended with nothing released to the clinic).

## Events

| Event | Topics | Data |
|---|---|---|
| `ClinicRegistered` | clinic | name, country |
| `EvidenceAnchored` | case_id | stage, hash |
| `CaseRecorded` | clinic | case_id, outcome, amount, refunded |

## Errors

| Code | Error |
|---|---|
| 1 | `ClinicNotRegistered` |
| 2 | `ClinicAlreadyRegistered` |
| 3 | `CaseAlreadyRecorded` |
| 4 | `InvalidAmounts` (negative values, zero amount, or released + refunded above amount) |
| 5 | `EvidenceAlreadyAnchored` |

## Verifying evidence

The app hashes `hekim|<case id>|<stage index>|<evidence note>` with SHA-256 when the clinic reports a stage, and calls `anchor_evidence`. Anyone holding the note can recompute the hash and compare it with `evidence(case_id, stage)`. The evidence root written by `record_case` is the SHA-256 of all stage hashes in order.

## Build, test, deploy

```bash
cargo test
stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/hekim_registry.wasm \
  --source-account <PLATFORM_SECRET> --network testnet -- --admin <PLATFORM_ADDRESS>
```

Seven unit tests cover clinic registration, the three outcomes and the trust score, rejected writes, one-time evidence anchoring, the admin auth requirement, the recorded auth tree and the published event topics.
