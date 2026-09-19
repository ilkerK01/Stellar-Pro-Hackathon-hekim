"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatTry, formatUsdc } from "@/lib/money";
import type { CaseView, Ramp } from "@/lib/types";
import { CaseStatusBadge, RegistryPanel, type ClinicProfile } from "./case-parts";
import { useLang } from "./lang";
import { SiteFooter, SiteHeader } from "./site-header";
import { AppHero, Button, Card, ErrorText, Field, Input, TxLink } from "./ui";

type Stage = { title: string; percent: number };
type Template = "dental" | "hair" | "surgery";

const templates: Record<Template, { en: Stage[]; tr: Stage[]; treatment: { en: string; tr: string } }> = {
  dental: {
    treatment: { en: "Two implants with zirconia crowns", tr: "İki implant ve zirkonyum kron" },
    en: [
      { title: "Arrival and examination", percent: 20 },
      { title: "Implant surgery", percent: 60 },
      { title: "Day 7 check-up", percent: 20 },
    ],
    tr: [
      { title: "Varış ve muayene", percent: 20 },
      { title: "İmplant ameliyatı", percent: 60 },
      { title: "7. gün kontrolü", percent: 20 },
    ],
  },
  hair: {
    treatment: { en: "FUE hair transplant, 3,500 grafts", tr: "FUE saç ekimi, 3.500 greft" },
    en: [
      { title: "Consultation and planning", percent: 30 },
      { title: "Transplant day", percent: 60 },
      { title: "Day 10 wash and check", percent: 10 },
    ],
    tr: [
      { title: "Görüşme ve planlama", percent: 30 },
      { title: "Ekim günü", percent: 60 },
      { title: "10. gün yıkama ve kontrol", percent: 10 },
    ],
  },
  surgery: {
    treatment: { en: "Knee replacement with 4-night stay", tr: "Diz protezi, 4 gece yatış" },
    en: [
      { title: "Admission and tests", percent: 20 },
      { title: "Operation", percent: 50 },
      { title: "Hospital stay", percent: 20 },
      { title: "Discharge check", percent: 10 },
    ],
    tr: [
      { title: "Yatış ve tetkikler", percent: 20 },
      { title: "Ameliyat", percent: 50 },
      { title: "Hastane yatışı", percent: 20 },
      { title: "Taburcu kontrolü", percent: 10 },
    ],
  },
};

function NewPlanForm({ clinicName, onCreated }: { clinicName: string; onCreated: () => void }) {
  const { t, lang } = useLang();
  const [template, setTemplate] = useState<Template>("dental");
  const [title, setTitle] = useState("");
  const [treatment, setTreatment] = useState(templates.dental.treatment[lang]);
  const [patientName, setPatientName] = useState("");
  const [patientEmail, setPatientEmail] = useState("");
  const [total, setTotal] = useState("10");
  const [stages, setStages] = useState<Stage[]>(templates.dental[lang]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const apply = (tpl: Template) => {
    setTemplate(tpl);
    setStages(templates[tpl][lang]);
    setTreatment(templates[tpl].treatment[lang]);
  };

  const sum = stages.reduce((a, s) => a + (Number(s.percent) || 0), 0);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        setCreated(null);
        try {
          const res = await api<{ case: CaseView }>("/api/cases", {
            body: {
              title: title || treatment,
              treatment,
              patientName,
              patientEmail,
              clinicName,
              total,
              milestones: stages,
            },
          });
          setCreated(res.case.id);
          setPatientName("");
          setPatientEmail("");
          setTitle("");
          onCreated();
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        {(["dental", "hair", "surgery"] as const).map((tpl) => (
          <button
            key={tpl}
            type="button"
            onClick={() => apply(tpl)}
            className={`rounded-full px-3 py-1.5 text-sm ${
              template === tpl ? "bg-ink text-white" : "bg-paper-2 text-ink-2 hover:bg-line"
            }`}
          >
            {t(tpl === "dental" ? "clinic.form.tplDental" : tpl === "hair" ? "clinic.form.tplHair" : "clinic.form.tplSurgery")}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("clinic.form.treatment")}>
          <Input value={treatment} onChange={(e) => setTreatment(e.target.value)} required />
        </Field>
        <Field label={t("clinic.form.title")}>
          <Input value={title} placeholder={treatment} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("clinic.form.patientName")}>
          <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} required />
        </Field>
        <Field label={t("clinic.form.patientEmail")}>
          <Input type="email" value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} required />
        </Field>
        <Field label={t("clinic.form.total")}>
          <Input
            type="number"
            min="3"
            step="0.01"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-2">{t("common.stages")}</p>
        {stages.map((s, i) => (
          <div key={i} className="flex gap-2">
            <Input
              aria-label={t("clinic.form.stage")}
              value={s.title}
              onChange={(e) => setStages(stages.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              required
            />
            <Input
              aria-label={t("clinic.form.percent")}
              type="number"
              min="1"
              max="100"
              className="!w-24"
              value={s.percent}
              onChange={(e) =>
                setStages(stages.map((x, j) => (j === i ? { ...x, percent: Number(e.target.value) } : x)))
              }
              required
            />
            <span className="self-center text-xs whitespace-nowrap text-ink-3">
              {formatUsdc(((Number(total) || 0) * (Number(s.percent) || 0)) / 100)}
            </span>
            {stages.length > 1 && (
              <button
                type="button"
                className="rounded-full px-2 text-ink-3 hover:bg-paper-2"
                aria-label="Remove"
                onClick={() => setStages(stages.filter((_, j) => j !== i))}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="flex items-center justify-between">
          {stages.length < 6 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setStages([...stages, { title: "", percent: 0 }])}
            >
              + {t("clinic.form.addStage")}
            </Button>
          )}
          <span className={`text-xs ${sum === 100 ? "text-green" : "text-coral"}`}>
            {t("clinic.form.sum", { sum })}
          </span>
        </div>
      </div>
      <Button type="submit" busy={busy} disabled={sum !== 100}>
        {t("clinic.form.submit")}
      </Button>
      <ErrorText error={error} />
      {created && (
        <p className="text-sm text-green">
          {created} ·{" "}
          <Link href={`/clinic/case/${created}`} className="underline underline-offset-2">
            {t("common.open")} →
          </Link>
        </p>
      )}
    </form>
  );
}

type ClinicData = { profile: ClinicProfile; wallet: { usdc: string | null; xlm: string }; ramps: Ramp[] };

function Payouts({ data, reload }: { data: ClinicData | null; reload: () => void }) {
  const { t } = useLang();
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pending = data?.ramps.filter((r) => r.status !== "completed" && r.status !== "error") ?? [];
    if (!pending.length) return;
    const id = setTimeout(async () => {
      await Promise.all(pending.map((r) => api("/api/clinic", { body: { action: "refresh", rampId: r.id } }).catch(() => null)));
      reload();
    }, 5000);
    return () => clearTimeout(id);
  }, [data, reload]);

  return (
    <Card>
      <p className="text-xs text-ink-3">{t("clinic.wallet")}</p>
      <p className="font-display text-3xl">
        {formatUsdc(data?.wallet.usdc ?? 0)} <span className="text-sm text-ink-3">USDC</span>
      </p>
      <form
        className="mt-4 space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/clinic", { body: { action: "withdraw", amount } });
            reload();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t("clinic.withdrawAmount")} hint={t("clinic.withdrawHint")}>
          <div className="flex gap-2">
            <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Button type="submit" busy={busy}>
              {t("clinic.withdrawSubmit")}
            </Button>
          </div>
        </Field>
        <ErrorText error={error} />
      </form>
      {!!data?.ramps.length && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-3">{t("clinic.payouts")}</p>
          <ul className="space-y-1.5 text-sm">
            {data.ramps.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span>
                  {formatUsdc(r.amountIn)} USDC → {r.amountOut ? `${formatTry(r.amountOut)} TL` : "…"}
                </span>
                <span className="flex items-center gap-2 text-xs text-ink-3">
                  {r.paymentHash && <TxLink hash={r.paymentHash} />}
                  <span className={r.status === "completed" ? "text-green" : ""}>{r.status.replaceAll("_", " ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function ClinicDesk() {
  const { t, lang } = useLang();
  const [cases, setCases] = useState<CaseView[] | null>(null);
  const [data, setData] = useState<ClinicData | null>(null);

  const reload = useCallback(() => {
    api<{ cases: CaseView[] }>("/api/cases").then((r) => setCases(r.cases)).catch(() => setCases([]));
    api<ClinicData>("/api/clinic").then(setData).catch(() => null);
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(() => {
      api<{ cases: CaseView[] }>("/api/cases").then((r) => setCases(r.cases)).catch(() => null);
    }, 8000);
    return () => clearInterval(id);
  }, [reload]);

  return (
    <>
      <SiteHeader />
      <AppHero kicker={data?.profile.name} title={t("clinic.title")} subtitle={t("clinic.subtitle")} />
      <main className="relative mx-auto -mt-12 grid w-full max-w-6xl gap-5 px-4 pb-16 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <h2 className="mb-4 font-display text-xl">{t("clinic.new")}</h2>
            <NewPlanForm key={lang} clinicName={data?.profile.name ?? "Clinic"} onCreated={reload} />
          </Card>
          <Card>
            <h2 className="mb-3 font-display text-xl">{t("clinic.cases")}</h2>
            {!cases ? (
              <p className="text-sm text-ink-3">{t("common.loading")}…</p>
            ) : !cases.length ? (
              <p className="text-sm text-ink-3">{t("common.noCases")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {cases.map((c) => {
                  const waiting = c.milestones.some((m) => m.status === "completed" || m.status === "disputed");
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/clinic/case/${c.id}`}
                        className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-paper"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {c.patientName} · {c.title}
                          </p>
                          <p className="font-mono text-xs text-ink-3">
                            {c.id} · {formatUsdc(c.total)} USDC
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {waiting && <span className="pulse-ring h-2 w-2 rounded-full bg-amber" />}
                          <CaseStatusBadge status={c.status} />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Payouts data={data} reload={reload} />
          <Card>
            <RegistryPanel profile={data?.profile ?? null} />
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
