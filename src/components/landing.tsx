"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import type { Rules } from "@/lib/types";
import { RegistryPanel, type ClinicProfile } from "./case-parts";
import { useLang } from "./lang";
import { Story } from "./home/story";
import { ControlBanner, ForClinics, SafetyNet, Treatments } from "./home/sections";
import { Waves } from "./home/waves";
import { FloatingNav, SiteFooter } from "./site-header";
import { Button, ErrorText, Input } from "./ui";

type Config = { rules: Rules; clinic: ClinicProfile };

const corridors = [
  { code: "TR", en: "Türkiye", tr: "Türkiye", cur: "TRY", from: { en: "UK, Germany, Gulf", tr: "Birleşik Krallık, Almanya, Körfez" }, live: true },
  { code: "MX", en: "Mexico", tr: "Meksika", cur: "MXN", from: { en: "United States", tr: "ABD" }, live: false },
  { code: "TH", en: "Thailand", tr: "Tayland", cur: "THB", from: { en: "Europe, Australia", tr: "Avrupa, Avustralya" }, live: false },
  { code: "CO", en: "Colombia", tr: "Kolombiya", cur: "COP", from: { en: "United States, Canada", tr: "ABD, Kanada" }, live: false },
  { code: "KR", en: "South Korea", tr: "Güney Kore", cur: "KRW", from: { en: "China, Japan, US", tr: "Çin, Japonya, ABD" }, live: false },
];

function Section({ id, kicker, title, children, className = "" }: { id?: string; kicker: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-16 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <p className="text-xs font-semibold tracking-wide text-teal uppercase">{kicker}</p>
        <h2 className="font-display mt-2 max-w-3xl text-3xl sm:text-4xl">{title}</h2>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function HeroWaves() {
  const lines = Array.from({ length: 22 }, (_, i) => i);
  return (
    <svg
      className="pointer-events-none absolute top-[18%] left-0 h-[60%] w-[70%] opacity-60"
      viewBox="0 0 800 400"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lines.map((i) => (
        <path
          key={i}
          d={`M-20 ${120 + i * 9} C 180 ${40 + i * 12}, 420 ${260 - i * 6}, 820 ${150 + i * 7}`}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function DemoForm() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await api<{ case: { id: string } }>("/api/demo", { body: { email, name } });
          setCreated(res.case.id);
          try {
            localStorage.setItem("hekim-demo-email", email);
          } catch {}
        } catch (err) {
          setError(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input placeholder={t("demo.name")} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <Input
        type="email"
        required
        placeholder={t("demo.email")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
      />
      <Button type="submit" busy={busy} className="w-full">
        {t("demo.submit")}
      </Button>
      <ErrorText error={error} />
      {created && (
        <div className="rounded-2xl bg-green-soft p-4 text-sm text-green">
          <p>{t("demo.done", { id: created })}</p>
          <Link href="/patient" className="mt-2 inline-block font-medium underline underline-offset-2">
            {t("demo.go")} →
          </Link>
        </div>
      )}
    </form>
  );
}

export function Landing() {
  const { t, lang } = useLang();
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    api<Config>("/api/config").then(setConfig).catch(() => setConfig(null));
  }, []);

  const fair = [1, 2, 3] as const;

  return (
    <>
      <section className="relative min-h-svh overflow-hidden bg-teal-hero text-white">
        <HeroWaves />
        <div className="absolute inset-y-0 right-0 hidden w-[58%] lg:block">
          <Image
            src="/brand/doctor-usdc-v2.webp"
            alt=""
            fill
            priority
            sizes="58vw"
            className="hero-figure object-contain object-right-bottom"
          />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-linear-to-t from-[#2a8e98] via-[#2a8e98]/40 to-transparent" />
        <FloatingNav />
        <div className="relative mx-auto flex min-h-svh max-w-6xl flex-col px-4 pt-28 pb-8 sm:px-6">
          <div className="rise my-auto max-w-2xl py-8">
            <h1 className="font-display text-[clamp(2.75rem,min(7vw,11vh),6.25rem)] leading-[1.02]">
              <span className="block bg-linear-to-r from-mint to-white bg-clip-text text-transparent">
                {t("hero.title1")}
              </span>
              <span className="block">{t("hero.title2")}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base text-white/85 sm:text-lg">{t("hero.lead")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#try">
                <Button className="!bg-linear-to-r from-white to-[#c8f5e6] !text-teal-2">{t("hero.cta")}</Button>
              </a>
              <a href="#how">
                <Button variant="dark">{t("hero.how")}</Button>
              </a>
            </div>
          </div>
          <div className="flex items-center gap-6 overflow-x-auto pt-6 text-sm font-medium whitespace-nowrap text-white/90 sm:gap-10 sm:text-base">
            {["Stellar", "Soroban", "USDC", "Privy", "Trustless Work", "SEP-10", "SEP-6", "SEP-38"].map((x) => (
              <span key={x}>{x}</span>
            ))}
            <span className="hidden h-3 min-w-24 flex-1 rounded-l-full bg-linear-to-r from-[#c9a7f0] via-[#8fb1f0] to-mint md:block" />
          </div>
        </div>
      </section>

      <Story />

      <SafetyNet />

      <Section kicker={t("fair.kicker")} title={t("fair.title")}>
        <div className="grid gap-4 md:grid-cols-3">
          {fair.map((n) => (
            <div key={n} className="rounded-3xl border border-line bg-white p-6">
              <p className="font-medium">{t(`fair.${n}.t`)}</p>
              <p className="mt-2 text-sm text-ink-2">{t(`fair.${n}.b`)}</p>
            </div>
          ))}
        </div>
        {config && config.rules.approvalWindowMinutes < 4320 && (
          <p className="mt-3 text-xs text-ink-3">{t("fair.demo")}</p>
        )}
      </Section>

      <section id="registry" className="waves scroll-mt-16 bg-teal-2 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-mint uppercase">{t("registry.kicker")}</p>
            <h2 className="font-display mt-2 text-3xl sm:text-4xl">{t("registry.title")}</h2>
            <p className="mt-4 text-white/75">{t("registry.body")}</p>
          </div>
          <div className="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10">
            <RegistryPanel profile={config?.clinic ?? null} dark />
          </div>
        </div>
      </section>

      <ForClinics />

      <Treatments />

      <Section id="pricing" kicker={t("pricing.kicker")} title={t("pricing.title")}>
        <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="overflow-hidden rounded-3xl border border-line bg-white">
              {[
                ["1%", t("pricing.row.hekim"), "text-teal"],
                ["0.3%", t("pricing.row.protocol"), "text-ink-2"],
                ["3–5%", t("pricing.row.card"), "text-coral line-through decoration-coral/40"],
              ].map(([pct, label, tone]) => (
                <div key={label} className="flex items-center gap-5 border-b border-line px-5 py-4 last:border-0">
                  <span className={`font-display w-16 shrink-0 text-2xl ${tone}`}>{lang === "tr" ? pct.replace(".", ",") : pct}</span>
                  <span className="text-sm text-ink-2">{label}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-ink-2">{t("pricing.example")}</p>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-teal-hero">
            <Image src="/brand/doctor-bag.webp" alt="" fill sizes="(min-width: 1024px) 30vw, 90vw" className="object-cover" />
          </div>
        </div>
      </Section>

      <Section id="corridors" kicker={t("corridors.kicker")} title={t("corridors.title")} className="bg-white">
        <p className="-mt-4 mb-8 max-w-3xl text-ink-2">{t("corridors.body")}</p>
        <div className="overflow-x-auto rounded-3xl border border-line">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-paper text-xs text-ink-3">
              <tr>
                <th className="px-5 py-3 font-medium">{t("corridors.country")}</th>
                <th className="px-5 py-3 font-medium">{t("corridors.currency")}</th>
                <th className="px-5 py-3 font-medium">{t("corridors.patients")}</th>
                <th className="px-5 py-3 font-medium">{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {corridors.map((c) => (
                <tr key={c.cur} className="border-t border-line">
                  <td className="px-5 py-3">
                    <span className="mr-2 inline-block w-8 rounded bg-paper-2 py-0.5 text-center font-mono text-[10px] text-ink-2">
                      {c.code}
                    </span>
                    {c[lang]}
                  </td>
                  <td className="px-5 py-3 font-mono">{c.cur}</td>
                  <td className="px-5 py-3 text-ink-2">{c.from[lang]}</td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        c.live ? "bg-green-soft text-green" : "bg-paper-2 text-ink-3"
                      }`}
                    >
                      {c.live ? t("corridors.live") : t("corridors.next")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <section id="try" className="relative scroll-mt-20 overflow-hidden bg-linear-to-br from-teal-2 via-[#1d7f86] to-[#3fd6a4] px-4 py-24 text-white sm:px-6">
        <Waves className="absolute inset-0 h-full w-full opacity-60" />
        <div className="relative mx-auto grid max-w-6xl items-start gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">
              {lang === "tr" ? (
                <>
                  Daha çok hasta.
                  <br />
                  Daha az itiraz.
                  <br />
                  Daha hızlı ödeme.
                </>
              ) : (
                <>
                  More patients.
                  <br />
                  Fewer disputes.
                  <br />
                  Faster payouts.
                </>
              )}
            </h2>
            <div className="relative mt-8 aspect-square w-full max-w-xs overflow-hidden rounded-3xl bg-teal-hero">
              <Image src="/brand/doctor-bag.webp" alt="" fill sizes="320px" className="object-cover" />
            </div>
          </div>
          <div className="rounded-3xl bg-white p-6 text-ink shadow-2xl shadow-black/20">
            <h3 className="font-display text-2xl">{t("demo.title")}</h3>
            <p className="mt-2 mb-5 text-sm text-ink-2">{t("demo.body")}</p>
            <DemoForm />
          </div>
        </div>
        <div className="relative">
          <ControlBanner />
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
