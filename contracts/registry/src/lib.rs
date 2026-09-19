#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, BytesN, Env,
    String,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 120 * DAY_IN_LEDGERS;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    ClinicNotRegistered = 1,
    ClinicAlreadyRegistered = 2,
    CaseAlreadyRecorded = 3,
    InvalidAmounts = 4,
    EvidenceAlreadyAnchored = 5,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Outcome {
    Completed = 0,
    Arbitrated = 1,
    Refunded = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Clinic {
    pub name: String,
    pub country: String,
    pub registered_at: u64,
    pub cases: u32,
    pub clean_cases: u32,
    pub disputed_cases: u32,
    pub refunded_cases: u32,
    pub volume: i128,
    pub released: i128,
    pub refunded: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CaseRecord {
    pub clinic: Address,
    pub amount: i128,
    pub released: i128,
    pub refunded: i128,
    pub disputes: u32,
    pub outcome: Outcome,
    pub evidence_root: BytesN<32>,
    pub closed_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Evidence {
    pub hash: BytesN<32>,
    pub anchored_at: u64,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Clinic(Address),
    Case(String),
    Evidence(String, u32),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClinicRegistered {
    #[topic]
    pub clinic: Address,
    pub name: String,
    pub country: String,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EvidenceAnchored {
    #[topic]
    pub case_id: String,
    pub stage: u32,
    pub hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CaseRecorded {
    #[topic]
    pub clinic: Address,
    pub case_id: String,
    pub outcome: Outcome,
    pub amount: i128,
    pub refunded: i128,
}

#[contract]
pub struct HekimRegistry;

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[contractimpl]
impl HekimRegistry {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        bump_instance(&env);
    }

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }

    pub fn register_clinic(
        env: Env,
        clinic: Address,
        name: String,
        country: String,
    ) -> Result<(), Error> {
        admin(&env).require_auth();
        let key = DataKey::Clinic(clinic.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::ClinicAlreadyRegistered);
        }
        let record = Clinic {
            name: name.clone(),
            country: country.clone(),
            registered_at: env.ledger().timestamp(),
            cases: 0,
            clean_cases: 0,
            disputed_cases: 0,
            refunded_cases: 0,
            volume: 0,
            released: 0,
            refunded: 0,
        };
        env.storage().persistent().set(&key, &record);
        bump(&env, &key);
        bump_instance(&env);
        ClinicRegistered {
            clinic,
            name,
            country,
        }
        .publish(&env);
        Ok(())
    }

    pub fn anchor_evidence(
        env: Env,
        case_id: String,
        stage: u32,
        hash: BytesN<32>,
    ) -> Result<(), Error> {
        admin(&env).require_auth();
        let key = DataKey::Evidence(case_id.clone(), stage);
        if env.storage().persistent().has(&key) {
            return Err(Error::EvidenceAlreadyAnchored);
        }
        let evidence = Evidence {
            hash: hash.clone(),
            anchored_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &evidence);
        bump(&env, &key);
        bump_instance(&env);
        EvidenceAnchored {
            case_id,
            stage,
            hash,
        }
        .publish(&env);
        Ok(())
    }

    pub fn record_case(
        env: Env,
        case_id: String,
        clinic: Address,
        amount: i128,
        released: i128,
        refunded: i128,
        disputes: u32,
        evidence_root: BytesN<32>,
    ) -> Result<Outcome, Error> {
        admin(&env).require_auth();
        let settled = released.checked_add(refunded).ok_or(Error::InvalidAmounts)?;
        if amount <= 0 || released < 0 || refunded < 0 || settled > amount {
            return Err(Error::InvalidAmounts);
        }
        let case_key = DataKey::Case(case_id.clone());
        if env.storage().persistent().has(&case_key) {
            return Err(Error::CaseAlreadyRecorded);
        }
        let clinic_key = DataKey::Clinic(clinic.clone());
        let mut stats: Clinic = env
            .storage()
            .persistent()
            .get(&clinic_key)
            .ok_or(Error::ClinicNotRegistered)?;

        let outcome = if disputes == 0 {
            Outcome::Completed
        } else if released == 0 {
            Outcome::Refunded
        } else {
            Outcome::Arbitrated
        };

        stats.cases = stats.cases.checked_add(1).ok_or(Error::InvalidAmounts)?;
        stats.volume = stats.volume.checked_add(amount).ok_or(Error::InvalidAmounts)?;
        stats.released = stats.released.checked_add(released).ok_or(Error::InvalidAmounts)?;
        stats.refunded = stats.refunded.checked_add(refunded).ok_or(Error::InvalidAmounts)?;
        match outcome {
            Outcome::Completed => stats.clean_cases += 1,
            Outcome::Arbitrated => stats.disputed_cases += 1,
            Outcome::Refunded => {
                stats.disputed_cases += 1;
                stats.refunded_cases += 1;
            }
        }

        let record = CaseRecord {
            clinic: clinic.clone(),
            amount,
            released,
            refunded,
            disputes,
            outcome,
            evidence_root,
            closed_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&case_key, &record);
        env.storage().persistent().set(&clinic_key, &stats);
        bump(&env, &case_key);
        bump(&env, &clinic_key);
        bump_instance(&env);
        CaseRecorded {
            clinic,
            case_id,
            outcome,
            amount,
            refunded,
        }
        .publish(&env);
        Ok(outcome)
    }

    pub fn clinic(env: Env, clinic: Address) -> Option<Clinic> {
        env.storage().persistent().get(&DataKey::Clinic(clinic))
    }

    pub fn case(env: Env, case_id: String) -> Option<CaseRecord> {
        env.storage().persistent().get(&DataKey::Case(case_id))
    }

    pub fn evidence(env: Env, case_id: String, stage: u32) -> Option<Evidence> {
        env.storage()
            .persistent()
            .get(&DataKey::Evidence(case_id, stage))
    }

    pub fn trust_score(env: Env, clinic: Address) -> u32 {
        let stats: Option<Clinic> = env.storage().persistent().get(&DataKey::Clinic(clinic));
        match stats {
            Some(s) if s.cases > 0 => s.clean_cases * 10_000 / s.cases,
            _ => 0,
        }
    }
}

#[cfg(test)]
mod test;
