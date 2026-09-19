"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { Key } from "@/lib/i18n";
import { formatUsdc } from "@/lib/money";
import type { CaseView, Milestone, Rules } from "@/lib/types";
import { useLang } from "./lang";
import { SiteFooter, SiteHeader } from "./site-header";
import { AppHero, Badge, Button, Card, ContractLink, ErrorText } from "./ui";

type Dispute = { caseView: CaseView; milestone: Milestone };

function suggested(kind: Milestone["disputeKind"], rules: Rules | null) {
  if (kind === "no_show") return rules?.noShowPatientPercent ?? 50;
  if (kind === "no_response") return 0;
  return 100;
}

function DisputeCard({ d, rules, onDone }: { d: Dispute; rules: Rules | null; onDone: () => void }) {
  const { t } = useLang();
  const { caseView: c, milestone: m } = d;
  const kind = m.disputeKind ?? "patient";
  const [share, setShare] = useState(suggested(kind, rules));
  const [refundRest, setRefundRest] = useState(kind === "no_show");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fee = ((rules?.platformFeePercent ?? 1) + (rules?.protocolFeePercent ?? 0.3)) / 100;
  const net = Number(m.amount) * (1 - fee);
  const toPatient = (net * share) / 100;
  const toClinic = net - toPatient;
  const laterOpen = c.milestones.some((x) => x.idx > m.idx && (x.status === "pending" || x.status === "completed"));

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-ink-3">
            {c.id} · {t("common.stage")} {m.idx + 1}
          </p>
          <h3 className="font-display text-xl">{m.title}</h3>
          <p className="text-sm text-ink-2">
            {c.patientName} · {c.clinicName} · {formatUsdc(m.amount)} USDC
          </p>
          {c.contractId && (
            <p className="mt-1 text-xs text-ink-3">
              {t("common.escrow")}: <ContractLink id={c.contractId} />
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone="coral" pulse>
            {t(`dispute.${kind}` as Key)}
          </Badge>
          <span className="text-xs text-ink-3">
            {t("arbiter.filedBy")}: {kind === "patient" ? t("arbiter.byPatient") : t("arbiter.byClinic")}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-coral-soft/60 p-3 text-sm">
          <p className="text-xs font-medium text-coral">{t("arbiter.reason")}</p>
          <p className="mt-1 text-ink-2">{m.disputeNote}</p>
        </div>
        <div className="rounded-2xl bg-paper p-3 text-sm">
          <p className="text-xs font-medium text-ink-3">{t("case.evidence")}</p>
          <p className="mt-1 text-ink-2">{m.evidence ?? "–"}</p>
          {m.evidenceHash && <p className="mt-1 font-mono text-xs text-ink-3">sha256 {m.evidenceHash.slice(0, 20)}…</p>}
        </div>
      </div>

      <div className="rounded-2xl bg-violet-soft/70 p-3 text-sm text-violet">
        <span className="font-medium">{t("arbiter.guide")}: </span>
        {t(`arbiter.guide.${kind === "cancel" ? "patient" : kind}` as Key)}
      </div>

      <div>
        <div className="flex items-center justify-between text-sm">
          <span>
            {t("arbiter.toPatient")} <strong>{share}%</strong> · {formatUsdc(toPatient)} USDC
          </span>
          <span>
            {t("arbiter.toClinic")} <strong>{100 - share}%</strong> · {formatUsdc(toClinic)} USDC
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={share}
          onChange={(e) => setShare(Number(e.target.value))}
          className="mt-2 w-full accent-violet"
          aria-label={t("arbiter.toPatient")}
        />
        <div className="mt-1 flex items-center justify-between text-xs text-ink-3">
          <button type="button" className="underline underline-offset-2" onClick={() => setShare(suggested(kind, rules))}>
            {t("arbiter.suggested")}: {suggested(kind, rules)}%
          </button>
          <span>{t("arbiter.feesNote")}</span>
        </div>
      </div>

      {laterOpen && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={refundRest} onChange={(e) => setRefundRest(e.target.checked)} className="mt-1 accent-violet" />
          {t("arbiter.refundRest")}
        </label>
      )}

      <Button
        busy={busy}
        className="!bg-violet hover:!bg-[#4b3aa8]"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await api(`/api/cases/${c.id}`, {
              body: { action: "resolve", idx: m.idx, patientPercent: share, refundRest },
            });
            onDone();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("arbiter.decide")}
      </Button>
      <ErrorText error={error} />
    </Card>
  );
}

export function ArbiterDesk() {
  const { t } = useLang();
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);

  const reload = useCallback(() => {
    api<{ disputes: Dispute[] }>("/api/disputes").then((r) => setDisputes(r.disputes)).catch(() => setDisputes([]));
  }, []);

  useEffect(() => {
    reload();
    api<{ rules: Rules }>("/api/config").then((r) => setRules(r.rules)).catch(() => null);
    const id = setInterval(reload, 6000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <>
      <SiteHeader />
      <AppHero tone="violet" title={t("arbiter.title")} subtitle={t("arbiter.subtitle")} />
      <main className="relative mx-auto -mt-12 w-full max-w-4xl space-y-5 px-4 pb-16 sm:px-6">
        {!disputes ? (
          <Card>
            <p className="text-sm text-ink-3">{t("common.loading")}…</p>
          </Card>
        ) : !disputes.length ? (
          <Card>
            <p className="text-sm text-ink-3">{t("arbiter.none")}</p>
          </Card>
        ) : (
          disputes.map((d) => (
            <DisputeCard key={`${d.caseView.id}-${d.milestone.idx}`} d={d} rules={rules} onDone={reload} />
          ))
        )}
      </main>
      <SiteFooter />
    </>
  );
}
