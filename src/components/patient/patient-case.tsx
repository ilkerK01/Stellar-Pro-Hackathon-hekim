"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatUsdc } from "@/lib/money";
import type { CaseView, Milestone, Signable, SignRequest } from "@/lib/types";
import { ActivityLog, CaseHeader, CaseSummary, RegistryPanel, StageTrack, useNow, type ClinicProfile } from "../case-parts";
import { useLang } from "../lang";
import { SiteFooter, SiteHeader } from "../site-header";
import { AppHero, Button, Card, ErrorText, Notice, Spinner, Textarea } from "../ui";
import { useCase } from "../use-case";
import { WalletCard } from "./patient-home";
import { TopUp } from "./topup";
import { usePatient } from "./wallet";

function useSigned(caseId: string, onCase: (c: CaseView) => void) {
  const { address, sign, refresh } = usePatient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signed = async (
    key: string,
    prepare: Record<string, unknown>,
    kind: "fund" | "approve" | "dispute",
  ) => {
    setBusy(key);
    setError(null);
    try {
      const { signable } = await api<{ signable: Signable }>(`/api/cases/${caseId}`, {
        body: { ...prepare, address },
      });
      setBusy(`${key}:sign`);
      const signedXdr = await sign(signable);
      setBusy(key);
      const res = await api<{ case: CaseView }>(`/api/cases/${caseId}`, {
        body: { action: "submit", kind, address, signedXdr },
      });
      onCase(res.case);
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return { busy, error, setError, signed, setBusy };
}

function PatientSignActions({
  caseView,
  m,
  onCase,
  checkin,
}: {
  caseView: CaseView;
  m: Milestone;
  onCase: (c: CaseView) => void;
  checkin: string | null;
}) {
  const { t } = useLang();
  const now = useNow();
  const { address, signStatement } = usePatient();
  const { busy, error, setError, setBusy, signed } = useSigned(caseView.id, onCase);
  const [request, setRequest] = useState<SignRequest | null>(null);
  const [note, setNote] = useState("");

  const clinicEntry = m.attestations.find((a) => a.phase === "entry" && a.role === "clinic");
  const patientEntry = m.attestations.find((a) => a.phase === "entry" && a.role === "patient");
  const clinicExit = m.attestations.find((a) => a.phase === "exit" && a.role === "clinic");
  const patientExit = m.attestations.find((a) => a.phase === "exit" && a.role === "patient");
  const expired = m.signatureDue ? new Date(m.signatureDue.due).getTime() <= now : false;

  const prepare = async (phase: "entry" | "exit") => {
    setBusy(`prepare-${phase}`);
    setError(null);
    try {
      const res = await api<{ request: SignRequest }>(`/api/cases/${caseView.id}`, {
        body: { action: "sign-prepare", address, idx: m.idx, phase, checkin: phase === "entry" ? checkin : null },
      });
      setRequest(res.request);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!request) return;
    setBusy("sign");
    setError(null);
    try {
      const signature = await signStatement(request);
      const res = await api<{ case: CaseView }>(`/api/cases/${caseView.id}`, {
        body: { action: "sign-submit", address, nonce: request.nonce, signature },
      });
      onCase(res.case);
      setRequest(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  if (request) {
    return (
      <div className="space-y-3 rounded-2xl border border-teal/20 bg-white p-4">
        <p className="text-xs font-medium text-teal-2">{t("patient.signBox")}</p>
        <blockquote className="rounded-xl bg-paper px-3 py-2 text-sm text-ink-2">{request.statement}</blockquote>
        {request.inPerson && <Notice tone="green">{t("patient.arriveQrHint")}</Notice>}
        {m.status !== "pending" && <Notice tone="amber">{t("patient.exitNote")}</Notice>}
        <p className="font-mono text-[10px] break-all text-ink-3">SEP-53 · sha256 {request.digest}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" busy={busy === "sign"} onClick={confirm}>
            {busy === "sign" ? t("common.signing") : t("patient.signConfirm")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRequest(null)}>
            {t("common.cancel")}
          </Button>
        </div>
        <ErrorText error={error} />
      </div>
    );
  }

  const claim = (kind: "not_started" | "not_finished", fallback: string) => (
    <div className="space-y-2">
      <Textarea placeholder={t("patient.claimNote")} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button
        size="sm"
        variant="danger"
        busy={busy?.startsWith(kind)}
        disabled={!!busy}
        onClick={() =>
          signed(kind, { action: "prepare-dispute", idx: m.idx, note: note.trim() || fallback, kind }, "dispute")
        }
      >
        {fallback}
      </Button>
    </div>
  );

  if (m.status === "pending") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-ink-3">{t("sig.rule")}</p>
        {!patientEntry && (
          <div className="space-y-2">
            <Button size="sm" busy={busy === "prepare-entry"} onClick={() => prepare("entry")}>
              {checkin ? t("patient.arriveQr") : t("patient.arrive")}
            </Button>
            <p className="text-xs text-ink-3">{checkin ? t("patient.arriveQrHint") : t("patient.arriveHint")}</p>
          </div>
        )}
        {patientEntry && !clinicEntry && (
          <>
            <p className="text-sm text-ink-3">{t("patient.waitClinicStart")}</p>
            {expired && claim("not_started", t("patient.notStarted"))}
          </>
        )}
        {patientEntry && clinicEntry && !clinicExit && (
          <>
            <p className="text-sm text-ink-3">{t("patient.waitClinicFinish")}</p>
            {expired && claim("not_finished", t("patient.notFinished"))}
          </>
        )}
        <ErrorText error={error} />
      </div>
    );
  }

  if (clinicExit && !patientExit && (m.status === "completed" || m.status === "approved" || m.status === "released")) {
    return (
      <div className="space-y-2">
        <Button size="sm" variant="outline" busy={busy === "prepare-exit"} onClick={() => prepare("exit")}>
          {t("patient.exitSign")}
        </Button>
        <p className="text-xs text-ink-3">{t("patient.exitNote")}</p>
        <ErrorText error={error} />
      </div>
    );
  }

  return null;
}

function StageActions({
  caseView,
  m,
  onCase,
  checkin,
}: {
  caseView: CaseView;
  m: Milestone;
  onCase: (c: CaseView) => void;
  checkin: string | null;
}) {
  const { t } = useLang();
  const { busy, error, signed, setBusy, setError } = useSigned(caseView.id, onCase);
  const [disputing, setDisputing] = useState(false);
  const [note, setNote] = useState("");

  if (caseView.status !== "funded") return null;
  const label = (key: string, text: string) =>
    busy === `${key}:sign` ? t("common.signing") : busy === key ? t("common.working") : text;

  if (m.status === "approved") {
    return (
      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          busy={busy === "release"}
          onClick={async () => {
            setBusy("release");
            setError(null);
            try {
              const res = await api<{ case: CaseView }>(`/api/cases/${caseView.id}`, { body: { action: "release", idx: m.idx } });
              onCase(res.case);
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(null);
            }
          }}
        >
          {t("case.retryRelease")}
        </Button>
        <ErrorText error={error} />
      </div>
    );
  }

  if (m.status !== "completed" && m.status !== "pending") {
    return caseView.signaturesRequired ? (
      <PatientSignActions caseView={caseView} m={m} onCase={onCase} checkin={null} />
    ) : null;
  }
  const previousOpen = caseView.milestones.slice(0, m.idx).some((p) => p.status !== "released" && p.status !== "resolved");
  if (m.status === "pending" && previousOpen) return null;

  return (
    <div className="space-y-2">
      {caseView.signaturesRequired && (
        <PatientSignActions caseView={caseView} m={m} onCase={onCase} checkin={checkin} />
      )}
      {m.status === "completed" && m.approvalDue && (
        <p className="text-xs text-ink-3">
          {t("case.approveBy")}: {new Date(m.approvalDue).toLocaleString()}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {m.status === "completed" && (
          <Button
            size="sm"
            busy={busy?.startsWith("approve")}
            disabled={!!busy}
            onClick={() => signed("approve", { action: "prepare-approve", idx: m.idx }, "approve")}
          >
            {label("approve", t("case.approve"))}
          </Button>
        )}
        <Button size="sm" variant="danger" disabled={!!busy} onClick={() => setDisputing((v) => !v)}>
          {t("case.dispute")}
        </Button>
      </div>
      {disputing && (
        <div className="space-y-2 rounded-2xl bg-coral-soft/50 p-3">
          <p className="text-sm font-medium text-coral">{t("case.disputeTitle")}</p>
          <Textarea placeholder={t("case.disputePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            size="sm"
            variant="danger"
            busy={busy?.startsWith("dispute")}
            disabled={!note.trim() || !!busy}
            onClick={() => signed("dispute", { action: "prepare-dispute", idx: m.idx, note }, "dispute")}
          >
            {label("dispute", t("case.disputeSend"))}
          </Button>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}

function CaseBody({
  caseView,
  onCase,
  checkin,
}: {
  caseView: CaseView;
  onCase: (c: CaseView) => void;
  checkin: { stage: number; nonce: string } | null;
}) {
  const { t } = useLang();
  const { address, email, wallet } = usePatient();
  const { busy, error, signed, setBusy, setError } = useSigned(caseView.id, onCase);
  const [profile, setProfile] = useState<ClinicProfile | null>(null);

  useEffect(() => {
    api<{ clinic: ClinicProfile }>("/api/config").then((r) => setProfile(r.clinic)).catch(() => null);
  }, []);

  const mismatch = email && caseView.patientEmail !== email;
  const otherWallet = caseView.patientAddress && caseView.patientAddress !== address;
  const balance = Number(wallet?.usdc ?? 0);
  const shortBy = Math.max(0, Number(caseView.total) - balance);
  const activated = wallet?.exists && wallet.usdc !== null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-5">
        <Card className="space-y-5">
          <CaseHeader caseView={caseView} />
          <CaseSummary caseView={caseView} />
          {mismatch || otherWallet ? (
            <Notice tone="coral">{t("patient.noPlans")}</Notice>
          ) : caseView.status === "open" ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-teal/20 bg-teal-soft/40 p-4">
                <p className="mb-3 text-sm text-teal-2">{t("case.registryGate")}</p>
                <RegistryPanel profile={profile} />
              </div>
              <p className="text-sm text-ink-2">{t("case.acceptHint")}</p>
              <Button
                busy={busy === "accept"}
                onClick={async () => {
                  setBusy("accept");
                  setError(null);
                  try {
                    const res = await api<{ case: CaseView }>(`/api/cases/${caseView.id}`, {
                      body: { action: "accept", address, email },
                    });
                    onCase(res.case);
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "accept" ? t("common.working") : t("case.accept")}
              </Button>
            </div>
          ) : caseView.status === "accepted" ? (
            <div className="space-y-3">
              <p className="text-sm text-ink-2">{t("case.fundHint")}</p>
              {shortBy > 0 && activated && <Notice tone="amber">{t("case.needMore", { amount: formatUsdc(shortBy) })}</Notice>}
              <Button
                busy={busy?.startsWith("fund")}
                disabled={!activated || shortBy > 0 || !!busy}
                onClick={() => signed("fund", { action: "prepare-fund" }, "fund")}
              >
                {busy === "fund:sign"
                  ? t("common.signing")
                  : busy === "fund"
                    ? t("common.working")
                    : t("case.fund", { amount: formatUsdc(caseView.total) })}
              </Button>
            </div>
          ) : null}
          <ErrorText error={error} />
          <StageTrack
            caseView={caseView}
            renderActions={(m) => (
              <StageActions
                caseView={caseView}
                m={m}
                onCase={onCase}
                checkin={checkin && checkin.stage === m.idx ? checkin.nonce : null}
              />
            )}
          />
          {caseView.status === "funded" && <p className="text-xs text-ink-3">{t("case.yield")}</p>}
          {caseView.status === "closed" && <Notice tone="green">{t("case.closedNote")}</Notice>}
        </Card>
        <ActivityLog events={caseView.events} />
      </div>
      <div className="space-y-5">
        <WalletCard compact />
        {(caseView.status === "open" || caseView.status === "accepted") && activated && (
          <Card>
            <h3 className="mb-3 font-medium">{t("patient.topup")}</h3>
            <TopUp caseId={caseView.id} suggestUsdc={shortBy > 0 ? shortBy : undefined} />
          </Card>
        )}
        <Card>
          <p className="mb-2 text-xs font-medium text-ink-3">{t("case.registry")}</p>
          <RegistryPanel profile={profile} />
        </Card>
      </div>
    </div>
  );
}

export function PatientCase({ id, checkin = null }: { id: string; checkin?: { stage: number; nonce: string } | null }) {
  const { t } = useLang();
  const { ready, authenticated, address, login } = usePatient();
  const { caseView, error, setCaseView } = useCase(id);

  return (
    <>
      <SiteHeader />
      <AppHero kicker={t("case.plan")} title={caseView?.title ?? id} subtitle={caseView?.clinicName}>
        <Link href="/patient" className="mt-4 inline-block text-sm text-white/70 hover:text-white">
          ← {t("common.back")}
        </Link>
      </AppHero>
      <main className="relative mx-auto -mt-12 w-full max-w-6xl px-4 pb-16 sm:px-6">
        {!ready || !caseView ? (
          <Card>
            <p className="flex items-center gap-2 text-sm text-ink-3">
              {!error && <Spinner />} {error ?? t("common.loading")}
            </p>
          </Card>
        ) : !authenticated || !address ? (
          <Card>
            <Button onClick={authenticated ? undefined : login}>{t("patient.login")}</Button>
            {authenticated && (
              <Link href="/patient" className="ml-3 text-sm underline">
                {t("patient.createWallet")}
              </Link>
            )}
          </Card>
        ) : (
          <CaseBody caseView={caseView} onCase={setCaseView} checkin={checkin} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
