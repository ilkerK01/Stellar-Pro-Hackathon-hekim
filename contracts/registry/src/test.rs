use super::*;
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, AuthorizedFunction, Events as _},
    xdr::{ContractEventBody, ScVal},
    BytesN, Env, String, Symbol,
};

fn setup() -> (Env, HekimRegistryClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(HekimRegistry, (admin.clone(),));
    let client = HekimRegistryClient::new(&env, &id);
    (env, client, admin)
}

fn text(env: &Env, value: &str) -> String {
    String::from_str(env, value)
}

#[test]
fn registers_clinic_once() {
    let (env, client, _) = setup();
    let clinic = Address::generate(&env);
    client.register_clinic(&clinic, &text(&env, "Demo Clinic"), &text(&env, "TR"));
    let stored = client.clinic(&clinic).unwrap();
    assert_eq!(stored.name, text(&env, "Demo Clinic"));
    assert_eq!(stored.cases, 0);
    assert_eq!(
        client.try_register_clinic(&clinic, &text(&env, "Again"), &text(&env, "TR")),
        Err(Ok(Error::ClinicAlreadyRegistered))
    );
}

#[test]
fn records_outcomes_and_scores() {
    let (env, client, _) = setup();
    let clinic = Address::generate(&env);
    client.register_clinic(&clinic, &text(&env, "Demo Clinic"), &text(&env, "TR"));
    let root = BytesN::from_array(&env, &[7; 32]);

    let clean = client.record_case(&text(&env, "HK-1"), &clinic, &1000, &987, &0, &0, &root);
    assert_eq!(clean, Outcome::Completed);
    let split = client.record_case(&text(&env, "HK-2"), &clinic, &1000, &500, &487, &1, &root);
    assert_eq!(split, Outcome::Arbitrated);
    let refund = client.record_case(&text(&env, "HK-3"), &clinic, &1000, &0, &987, &1, &root);
    assert_eq!(refund, Outcome::Refunded);

    let stats = client.clinic(&clinic).unwrap();
    assert_eq!(stats.cases, 3);
    assert_eq!(stats.clean_cases, 1);
    assert_eq!(stats.disputed_cases, 2);
    assert_eq!(stats.refunded_cases, 1);
    assert_eq!(stats.volume, 3000);
    assert_eq!(client.trust_score(&clinic), 3333);
    assert_eq!(client.case(&text(&env, "HK-2")).unwrap().refunded, 487);
}

#[test]
fn rejects_bad_records() {
    let (env, client, _) = setup();
    let clinic = Address::generate(&env);
    let root = BytesN::from_array(&env, &[1; 32]);
    assert_eq!(
        client.try_record_case(&text(&env, "HK-1"), &clinic, &1000, &1000, &0, &0, &root),
        Err(Ok(Error::ClinicNotRegistered))
    );
    client.register_clinic(&clinic, &text(&env, "Demo Clinic"), &text(&env, "TR"));
    assert_eq!(
        client.try_record_case(&text(&env, "HK-1"), &clinic, &1000, &800, &300, &1, &root),
        Err(Ok(Error::InvalidAmounts))
    );
    client.record_case(&text(&env, "HK-1"), &clinic, &1000, &1000, &0, &0, &root);
    assert_eq!(
        client.try_record_case(&text(&env, "HK-1"), &clinic, &1000, &1000, &0, &0, &root),
        Err(Ok(Error::CaseAlreadyRecorded))
    );
}

#[test]
fn anchors_evidence_once() {
    let (env, client, _) = setup();
    let hash = BytesN::from_array(&env, &[9; 32]);
    client.anchor_evidence(&text(&env, "HK-1"), &0, &hash);
    assert_eq!(client.evidence(&text(&env, "HK-1"), &0).unwrap().hash, hash);
    assert!(client.evidence(&text(&env, "HK-1"), &1).is_none());
    assert_eq!(
        client.try_anchor_evidence(&text(&env, "HK-1"), &0, &hash),
        Err(Ok(Error::EvidenceAlreadyAnchored))
    );
}

#[test]
fn admin_authorizes_writes() {
    let (env, client, admin) = setup();
    let clinic = Address::generate(&env);
    client.register_clinic(&clinic, &text(&env, "Demo Clinic"), &text(&env, "TR"));
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, admin);
    match &auths[0].1.function {
        AuthorizedFunction::Contract((_, name, _)) => {
            assert_eq!(*name, Symbol::new(&env, "register_clinic"))
        }
        _ => panic!("unexpected auth"),
    }
}

#[test]
fn publishes_case_event() {
    let (env, client, _) = setup();
    let clinic = Address::generate(&env);
    client.register_clinic(&clinic, &text(&env, "Demo Clinic"), &text(&env, "TR"));
    let root = BytesN::from_array(&env, &[3; 32]);
    client.record_case(&text(&env, "HK-9"), &clinic, &1000, &987, &0, &0, &root);
    let all = env.events().all();
    let last = all.events().last().unwrap().clone();
    let ContractEventBody::V0(body) = last.body;
    let topics: std::vec::Vec<ScVal> = body.topics.to_vec();
    assert_eq!(topics.len(), 2);
    assert_eq!(topics[0], ScVal::Symbol("case_recorded".try_into().unwrap()));
    assert_eq!(topics[1], ScVal::try_from(&clinic).unwrap());
}

#[test]
#[should_panic]
fn requires_admin_auth() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let id = env.register(HekimRegistry, (admin,));
    let client = HekimRegistryClient::new(&env, &id);
    let clinic = Address::generate(&env);
    client.register_clinic(&clinic, &text(&env, "Demo Clinic"), &text(&env, "TR"));
}
