"use client";

import { useEffect, useState } from "react";
import type { Key } from "@/lib/i18n";
import { formatUsdc } from "@/lib/money";
import type { CaseEvent, CaseStatus, CaseView, Milestone, MilestoneStatus } from "@/lib/types";
import { useLang } from "./lang";
import { Badge, Card, ContractLink, TxLink } from "./ui";

const caseTone = { open: "amber", accepted: "teal", funded: "green", closed: "neutral" } as const;
const stageTone = {
  pending: "neutral",
  completed: "amber",
  approved: "teal",
  released: "green",
  disputed: "coral",
  resolved: "violet",
} as const;

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const { t } = useLang();
  return <Badge tone={caseTone[status]}>{t(`status.${status}` as Key)}</Badge>;
}

export function StageBadge({ status }: { status: MilestoneStatus }) {
  const { t } = useLang();
  return (
    <Badge tone={stageTone[status]} pulse={status === "completed" || status === "disputed"}>
      {t(`stage.${status}` as Key)}
    </Badge>
  );
}

function formatLeft(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}

export function ApprovalClock({ due }: { due: string }) {
  const { t } = useLang();
  const now = useNow();
  const left = new Date(due).getTime() - now;
  if (left <= 0) return <Badge tone="coral">{t("case.expired")}</Badge>;
  return <Badge tone="amber" pulse>{t("case.timeLeft", { time: formatLeft(left) })}</Badge>;
}

export function StageTrack({
  caseView,
  renderActions,
}: {
  caseView: CaseView;
  renderActions?: (m: Milestone) => React.ReactNode;
}) {
  const { t } = useLang();
  return (
    <ol className="space-y-3">
      {caseView.milestones.map((m) => {
        const pct = Math.round((Number(m.amount) / Number(caseView.total)) * 100);
        return (
          <li key={m.idx} className="rounded-2xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    m.status === "released"
                      ? "bg-green text-white"
                      : m.status === "resolved"
                        ? "bg-violet text-white"
                        : "bg-paper-2 text-ink-2"
                  }`}
                >
                  {m.status === "released" ? "✓" : m.idx + 1}
                </span>
                <div>
                  <p className="font-medium">{m.title}</p>
                  <p className="text-sm text-ink-3">
                    {formatUsdc(m.amount)} USDC · {pct}%
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.status === "completed" && m.approvalDue && <ApprovalClock due={m.approvalDue} />}
                <StageBadge status={m.status} />
              </div>
            </div>
            {m.evidence && (
              <div className="mt-3 rounded-xl bg-paper px-3 py-2 text-sm">
                <p className="text-xs font-medium text-ink-3">{t("case.evidence")}</p>
                <p className="mt-0.5 text-ink-2">{m.evidence}</p>
                {m.evidenceHash && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <span>{t("case.evidenceHash")}:</span>
                    <span className="font-mono">{m.evidenceHash.slice(0, 16)}…</span>
                    {m.evidenceTx && <TxLink hash={m.evidenceTx} />}
                  </p>
                )}
              </div>
            )}
            {m.disputeKind && (
              <div className="mt-3 rounded-xl bg-coral-soft/60 px-3 py-2 text-sm">
                <p className="text-xs font-medium text-coral">{t(`dispute.${m.disputeKind}` as Key)}</p>
                {m.disputeNote && <p className="mt-0.5 text-ink-2">{m.disputeNote}</p>}
                {m.status === "resolved" && m.patientShare !== null && (
                  <p className="mt-1 text-xs text-ink-2">
                    {t("arbiter.toPatient")} {m.patientShare}% · {t("arbiter.toClinic")} {100 - m.patientShare}%
                  </p>
                )}
              </div>
            )}
            {renderActions && <div className="mt-3 empty:hidden">{renderActions(m)}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function CaseSummary({ caseView }: { caseView: CaseView }) {
  const { t } = useLang();
  const items = [
    { label: t("common.total"), value: caseView.total, tone: "text-ink" },
    { label: t("common.locked"), value: caseView.locked, tone: "text-teal" },
    { label: t("common.released"), value: caseView.released, tone: "text-green" },
    { label: t("common.refunded"), value: caseView.refunded, tone: "text-violet" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-2xl border border-line bg-white px-4 py-3">
          <p className="text-xs text-ink-3">{i.label}</p>
          <p className={`font-display mt-0.5 text-xl ${i.tone}`}>
            {formatUsdc(i.value)} <span className="text-xs text-ink-3">USDC</span>
          </p>
        </div>
      ))}
    </div>
  );
}

export function CaseHeader({ caseView }: { caseView: CaseView }) {
  const { t } = useLang();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-mono text-xs text-ink-3">{caseView.id}</p>
        <h2 className="font-display text-2xl">{caseView.title}</h2>
        <p className="text-sm text-ink-2">
          {caseView.treatment} · {t("case.clinic")}: {caseView.clinicName} · {t("case.patient")}: {caseView.patientName}
        </p>
        {caseView.contractId && (
          <p className="mt-1 flex items-center gap-2 text-xs text-ink-3">
            {t("common.escrow")}: <ContractLink id={caseView.contractId} />
          </p>
        )}
      </div>
      <CaseStatusBadge status={caseView.status} />
    </div>
  );
}

export function ActivityLog({ events }: { events: CaseEvent[] }) {
  const { t, lang } = useLang();
  if (!events.length) return null;
  return (
    <Card>
      <h3 className="mb-3 font-medium">{t("common.activity")}</h3>
      <ul className="space-y-2.5">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
            <div className="min-w-0">
              <span className="text-xs text-ink-3">{t(`actor.${e.actor}` as Key)} · </span>
              <span className={e.kind === "registry_failed" ? "text-coral" : ""}>{t(`event.${e.kind}` as Key)}</span>
              {e.detail && e.kind !== "registry_recorded" && (
                <span className="block truncate text-xs text-ink-3">{e.detail}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-3">
              {e.txHash && <TxLink hash={e.txHash} />}
              <time dateTime={e.createdAt}>
                {new Date(e.createdAt).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export type ClinicRecordView = {
  name: string;
  country: string;
  registeredAt: number;
  cases: number;
  cleanCases: number;
  disputedCases: number;
  refundedCases: number;
  volume: string;
  released: string;
  refunded: string;
  trustScore: number;
};

export type ClinicProfile = {
  address: string;
  name: string;
  country: string;
  registryContractId: string | null;
  record: ClinicRecordView | null;
};

export function RegistryPanel({ profile, dark = false }: { profile: ClinicProfile | null; dark?: boolean }) {
  const { t, lang } = useLang();
  const r = profile?.record;
  const muted = dark ? "text-white/60" : "text-ink-3";
  const tile = dark ? "bg-white/10" : "bg-paper";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-xs ${muted}`}>{t("registry.live")}</p>
          <p className="font-display text-xl">{profile?.name ?? "…"}</p>
          {r && (
            <p className={`text-xs ${muted}`}>
              {r.country} · {t("registry.since")}{" "}
              {new Date(r.registeredAt * 1000).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-GB")}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className={`text-xs ${muted}`}>{t("registry.score")}</p>
          <p className="font-display text-4xl">{r && r.cases > 0 ? `${(r.trustScore / 100).toFixed(0)}` : "–"}</p>
        </div>
      </div>
      {!profile ? null : !r ? (
        <p className={`mt-4 text-sm ${muted}`}>{t("registry.unavailable")}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t("registry.cases"), String(r.cases)],
              [t("registry.clean"), String(r.cleanCases)],
              [t("registry.disputed"), String(r.disputedCases)],
              [t("registry.refunded"), `${formatUsdc(r.refunded)}`],
            ].map(([label, value]) => (
              <div key={label} className={`rounded-2xl px-3 py-2 ${tile}`}>
                <p className={`text-xs ${muted}`}>{label}</p>
                <p className="font-display text-lg">{value}</p>
              </div>
            ))}
          </div>
          {r.cases === 0 && <p className={`mt-3 text-sm ${muted}`}>{t("registry.empty")}</p>}
        </>
      )}
      {profile?.registryContractId && (
        <p className={`mt-3 flex items-center gap-2 text-xs ${muted}`}>
          {t("registry.contract")}:
          <a
            href={`https://stellar.expert/explorer/testnet/contract/${profile.registryContractId}`}
            target="_blank"
            rel="noreferrer"
            className={`font-mono underline underline-offset-2 ${dark ? "text-mint" : "text-teal"}`}
          >
            {profile.registryContractId.slice(0, 6)}…{profile.registryContractId.slice(-6)} ↗
          </a>
        </p>
      )}
    </div>
  );
}
