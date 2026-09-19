"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatUsdc } from "@/lib/money";
import type { CaseView, Milestone, Signable } from "@/lib/types";
import { ActivityLog, CaseHeader, CaseSummary, RegistryPanel, StageTrack, type ClinicProfile } from "../case-parts";
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

function StageActions({ caseView, m, onCase }: { caseView: CaseView; m: Milestone; onCase: (c: CaseView) => void }) {
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

  if (m.status !== "completed" && m.status !== "pending") return null;
  const previousOpen = caseView.milestones.slice(0, m.idx).some((p) => p.status !== "released" && p.status !== "resolved");
  if (m.status === "pending" && previousOpen) return null;

  return (
    <div className="space-y-2">
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

function CaseBody({ caseView, onCase }: { caseView: CaseView; onCase: (c: CaseView) => void }) {
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
          <StageTrack caseView={caseView} renderActions={(m) => <StageActions caseView={caseView} m={m} onCase={onCase} />} />
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

export function PatientCase({ id }: { id: string }) {
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
          <CaseBody caseView={caseView} onCase={setCaseView} />
        )}
      </main>
      <SiteFooter />
    </>
  );
}
