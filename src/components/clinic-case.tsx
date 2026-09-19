"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { errorMessage } from "@/lib/client/api";
import type { CaseView, Milestone } from "@/lib/types";
import { ActivityLog, CaseHeader, CaseSummary, StageTrack, useNow } from "./case-parts";
import { useLang } from "./lang";
import { SiteFooter, SiteHeader } from "./site-header";
import { AppHero, Button, Card, Copy, ErrorText, Notice, Textarea } from "./ui";
import { useCase } from "./use-case";

function StageActions({
  caseView,
  m,
  act,
}: {
  caseView: CaseView;
  m: Milestone;
  act: (body: Record<string, unknown>) => Promise<CaseView>;
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
  const { caseView, error, act } = useCase(id);
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
                renderActions={(m) => <StageActions caseView={caseView} m={m} act={act} />}
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
