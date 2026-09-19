"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { CaseView, Milestone } from "@/lib/types";
import { ActivityLog, CaseHeader, CaseSummary, StageTrack, useNow } from "./case-parts";
import { CheckinQr } from "./checkin-qr";
import { useLang } from "./lang";
import { SiteFooter, SiteHeader } from "./site-header";
import { AppHero, Button, Card, Copy, ErrorText, Notice, Textarea } from "./ui";
import { useCase } from "./use-case";

type Checkin = { nonce: string; expiresAt: string };

function ClinicSignActions({
  caseView,
  m,
  onCase,
}: {
  caseView: CaseView;
  m: Milestone;
  onCase: (c: CaseView) => void;
}) {
  const { t } = useLang();
  const now = useNow();
  const [scope, setScope] = useState("");
  const [done, setDone] = useState("");
  const [note, setNote] = useState("");
  const [checkin, setCheckin] = useState<Checkin | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    try {
      const res = await api<{ case?: CaseView; checkin?: Checkin | null }>(`/api/cases/${caseView.id}`, { body });
      if (res.case) onCase(res.case);
      if (res.checkin !== undefined) setCheckin(res.checkin);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const clinicEntry = m.attestations.find((a) => a.phase === "entry" && a.role === "clinic");
  const patientEntry = m.attestations.find((a) => a.phase === "entry" && a.role === "patient");
  const expired = m.signatureDue ? new Date(m.signatureDue.due).getTime() <= now : false;

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-3">{t("sig.rule")}</p>
      {!clinicEntry && (
        <div className="space-y-2">
          {patientEntry && <Notice tone="amber">{t("clinic.waitPatientStart")}</Notice>}
          <label className="block text-xs font-medium text-ink-2">{t("clinic.scopeLabel")}</label>
          <Textarea placeholder={t("clinic.scopePlaceholder")} value={scope} onChange={(e) => setScope(e.target.value)} />
          <Button
            size="sm"
            busy={busy === "entry"}
            disabled={!scope.trim() || !!busy}
            onClick={() => call("entry", { action: "clinic-sign", idx: m.idx, phase: "entry", statement: scope })}
          >
            {t("clinic.signScope")}
          </Button>
        </div>
      )}
      {clinicEntry && !patientEntry && (
        <div className="space-y-2">
          {checkin ? (
            <CheckinQr
              caseId={caseView.id}
              idx={m.idx}
              nonce={checkin.nonce}
              expiresAt={checkin.expiresAt}
              busy={busy === "checkin"}
              onRenew={() => call("checkin", { action: "clinic-checkin", idx: m.idx })}
            />
          ) : (
            <Button
              size="sm"
              variant="outline"
              busy={busy === "checkin"}
              onClick={() => call("checkin", { action: "clinic-checkin", idx: m.idx })}
            >
              {t("clinic.checkinShow")}
            </Button>
          )}
          <p className="text-sm text-ink-3">{t("clinic.waitArrival")}</p>
          {expired && (
            <div className="space-y-2">
              <Textarea placeholder={t("clinic.claimNote")} value={note} onChange={(e) => setNote(e.target.value)} />
              <Button
                size="sm"
                variant="danger"
                busy={busy === "no_show"}
                onClick={() =>
                  call("no_show", { action: "claim", idx: m.idx, kind: "no_show", note: note.trim() || t("clinic.noShow") })
                }
              >
                {t("clinic.noShowSigned")}
              </Button>
            </div>
          )}
        </div>
      )}
      {clinicEntry && patientEntry && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-ink-2">{t("clinic.exitLabel")}</label>
          <Textarea placeholder={t("clinic.exitPlaceholder")} value={done} onChange={(e) => setDone(e.target.value)} />
          <Button
            size="sm"
            busy={busy === "exit"}
            disabled={!done.trim() || !!busy}
            onClick={() => call("exit", { action: "clinic-sign", idx: m.idx, phase: "exit", statement: done })}
          >
            {t("clinic.signExit")}
          </Button>
        </div>
      )}
      <ErrorText error={error} />
    </div>
  );
}

function StageActions({
  caseView,
  m,
  act,
  onCase,
}: {
  caseView: CaseView;
  m: Milestone;
  act: (body: Record<string, unknown>) => Promise<CaseView>;
  onCase: (c: CaseView) => void;
}) {
  const { t } = useLang();
  const now = useNow();
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (caseView.status !== "funded") return null;

  const run = async (key: string, body: Record<string, unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await act(body);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const previousOpen = caseView.milestones
    .slice(0, m.idx)
    .some((p) => p.status !== "released" && p.status !== "resolved");

  if (m.status === "pending") {
    if (previousOpen) return <p className="text-xs text-ink-3">{t("clinic.previousFirst")}</p>;
    if (caseView.signaturesRequired) return <ClinicSignActions caseView={caseView} m={m} onCase={onCase} />;
    return (
      <div className="space-y-2">
        <Textarea
          placeholder={t("clinic.evidencePlaceholder")}
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            busy={busy === "complete"}
            disabled={!evidence.trim() || !!busy}
            onClick={() => run("complete", { action: "complete", idx: m.idx, evidence })}
          >
            {t("clinic.complete")}
          </Button>
          {m.idx === 0 && (
            <Button
              size="sm"
              variant="danger"
              busy={busy === "no_show"}
              disabled={!!busy}
              title={t("clinic.noShowHint")}
              onClick={() =>
                run("no_show", {
                  action: "claim",
                  idx: 0,
                  kind: "no_show",
                  note: evidence.trim() || t("clinic.noShow"),
                })
              }
            >
              {t("clinic.noShow")}
            </Button>
          )}
        </div>
        {m.idx === 0 && <p className="text-xs text-ink-3">{t("clinic.noShowHint")}</p>}
        <ErrorText error={error} />
      </div>
    );
  }

  if (m.status === "completed" && m.approvalDue) {
    const expired = new Date(m.approvalDue).getTime() <= now;
    return (
      <div className="space-y-2">
        {!expired ? (
          <p className="text-sm text-ink-3">{t("clinic.waitApproval")}</p>
        ) : (
          <>
            <Textarea placeholder={t("clinic.claimNote")} value={note} onChange={(e) => setNote(e.target.value)} />
            <Button
              size="sm"
              variant="danger"
              busy={busy === "no_response"}
              onClick={() =>
                run("no_response", {
                  action: "claim",
                  idx: m.idx,
                  kind: "no_response",
                  note: note.trim() || t("clinic.noResponse"),
                })
              }
            >
              {t("clinic.noResponse")}
            </Button>
          </>
        )}
        <ErrorText error={error} />
      </div>
    );
  }

  if (m.status === "approved") {
    return (
      <div className="space-y-2">
        <Button size="sm" variant="outline" busy={busy === "release"} onClick={() => run("release", { action: "release", idx: m.idx })}>
          {t("case.retryRelease")}
        </Button>
        <ErrorText error={error} />
      </div>
    );
  }

  return null;
}

export function ClinicCase({ id }: { id: string }) {
  const { t } = useLang();
  const { caseView, error, act, setCaseView } = useCase(id);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const link = `${origin}/patient`;
  const [registryBusy, setRegistryBusy] = useState(false);

  return (
    <>
      <SiteHeader />
      <AppHero kicker={t("clinic.title")} title={caseView?.title ?? id} subtitle={caseView?.patientName}>
        <Link href="/clinic" className="mt-4 inline-block text-sm text-white/70 hover:text-white">
          ← {t("common.back")}
        </Link>
      </AppHero>
      <main className="relative mx-auto -mt-12 w-full max-w-4xl space-y-5 px-4 pb-16 sm:px-6">
        {!caseView ? (
          <Card>
            <p className="text-sm text-ink-3">{error ?? `${t("common.loading")}…`}</p>
          </Card>
        ) : (
          <>
            <Card className="space-y-5">
              <CaseHeader caseView={caseView} />
              <CaseSummary caseView={caseView} />
              {caseView.status === "open" && (
                <Notice tone="amber">
                  <p className="font-medium">{t("clinic.shareLink")}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs">
                    {link} · {caseView.patientEmail} <Copy value={link} />
                  </p>
                </Notice>
              )}
              <StageTrack
                caseView={caseView}
                renderActions={(m) => <StageActions caseView={caseView} m={m} act={act} onCase={setCaseView} />}
              />
              {caseView.status === "closed" && (
                <Notice tone={caseView.registryTx ? "green" : "amber"}>
                  {caseView.registryTx ? (
                    t("case.closedNote")
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      busy={registryBusy}
                      onClick={async () => {
                        setRegistryBusy(true);
                        try {
                          await act({ action: "registry" });
                        } finally {
                          setRegistryBusy(false);
                        }
                      }}
                    >
                      {t("case.retryRegistry")}
                    </Button>
                  )}
                </Notice>
              )}
            </Card>
            <ActivityLog events={caseView.events} />
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
