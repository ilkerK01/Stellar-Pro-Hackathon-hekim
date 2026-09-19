"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { useLang } from "../lang";
import { Waves } from "./waves";

export function SafetyNet() {
  const { lang } = useLang();
  const tr = lang === "tr";
  const stats = [
    { v: "3", l: tr ? "plan başına aşama" : "stages per plan", b: tr ? "Her ödeme, hastanın tek tek onayladığı aşamalara bölünür." : "Every payment is split into stages the patient approves one by one." },
    { v: "~5s", l: tr ? "sonuçlanma" : "to settle", b: tr ? "Ödeme ve iadeler Stellar'da birkaç saniyede kesinleşir." : "Releases and refunds confirm on Stellar in a few seconds." },
    { v: "<$0.01", l: tr ? "ağ ücreti" : "network fee", b: tr ? "Stellar işlem ücreti bir sentin altında kalır." : "Stellar fees stay below a cent per transaction." },
    { v: "0", l: tr ? "seed ifadesi" : "seed phrases", b: tr ? "Hasta e-postayla girer, cüzdan arka planda kalır." : "Patients sign in with email. The wallet stays out of their way." },
  ];
  const market = [
    { v: tr ? "1,4 milyon" : "1.4 million", l: tr ? "sağlık turisti, Türkiye 2025" : "health tourists, Türkiye 2025" },
    { v: tr ? "3,02 milyar $" : "$3.02 billion", l: tr ? "sağlık turizmi geliri, Türkiye 2025" : "health tourism revenue, Türkiye 2025" },
    { v: tr ? "21-22 milyon" : "21-22 million", l: tr ? "hasta her yıl yurt dışında tedavi olur" : "patients travel abroad for care each year" },
  ];
  return (
    <section id="why" className="relative scroll-mt-20 overflow-hidden bg-paper">
      <Waves className="absolute -left-40 top-0 h-full w-[70%] opacity-80" color="rgba(91,71,201,0.10)" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div className="relative mx-auto h-[440px] w-full max-w-md">
          <div className="absolute top-0 left-6 h-52 w-40 overflow-hidden rounded-3xl bg-[#a8dcc8] shadow-xl">
            <Image src="/brand/patient.webp" alt="" fill sizes="160px" className="object-cover" />
          </div>
          <div className="absolute top-40 left-40 w-56 rounded-2xl bg-white p-3.5 shadow-xl">
            <p className="text-[11px] text-ink-3">Emily Carter · {tr ? "Hasta" : "Patient"}</p>
            <p className="text-sm font-medium">{tr ? "Aşama 1 onaylandı" : "Stage 1 approved"}</p>
          </div>
          <div className="absolute bottom-0 left-0 h-60 w-48 overflow-hidden rounded-3xl bg-[#f0b98c] shadow-xl">
            <Image src="/brand/surgeon.webp" alt="" fill sizes="192px" className="object-cover" />
          </div>
          <div className="absolute bottom-12 left-28 w-60 rounded-2xl bg-white p-3.5 shadow-xl">
            <p className="text-[11px] text-ink-3">Bosphorus Dental</p>
            <p className="text-sm font-medium">{tr ? "Aşama 2 ödendi · ₺1.743,48" : "Stage 2 released · ₺1,743.48"}</p>
          </div>
        </div>
        <div>
          <h2 className="font-display bg-linear-to-r from-violet to-[#c0508a] bg-clip-text text-4xl text-transparent sm:text-5xl">
            {tr ? "Her aşamada çalışan bir güvenlik ağı" : "A safety net that works at every stage"}
          </h2>
          <p className="mt-5 text-ink-2">
            {tr
              ? "Sağlık turistleri hiç görmedikleri kliniklere kapora gönderiyor. Klinikler iptallerin ve ters ibrazların peşinden koşuyor. hekim ikisinin arasına bir kontrat koyar: para yalnızca tedavi gerçekleştikçe hareket eder."
              : "Medical tourists wire deposits to clinics they have never seen. Clinics chase cancellations and chargebacks. hekim puts a contract between them: money moves only as treatment happens."}
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {stats.map((s) => (
              <div key={s.l}>
                <p className="font-display text-4xl text-violet">{s.v}</p>
                <p className="font-medium">{s.l}</p>
                <p className="mt-1 text-sm text-ink-3">{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="relative mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {market.map((m) => (
            <div key={m.l} className="rounded-3xl bg-teal-2 p-6 text-white">
              <p className="font-display text-4xl text-mint">{m.v}</p>
              <p className="mt-1 text-sm text-white/75">{m.l}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">
          {tr
            ? "Kaynaklar: USHAŞ verisi, Turizm Ajansı ve Ekonomim (2025); Medical Tourism Watch (küresel tahmin)."
            : "Sources: USHAŞ data via Turizm Ajansı and Ekonomim (2025); Medical Tourism Watch (global estimate)."}
        </p>
      </div>
    </section>
  );
}

function Code() {
  const lines: React.ReactNode[] = [
    <>
      <K>const</K> plan = <K>await</K> fetch(<S>&quot;/api/cases&quot;</S>, post({"{"}
    </>,
    <>
      {"  "}treatment: <S>&quot;Hair transplant&quot;</S>,
    </>,
    <>
      {"  "}patientEmail: <S>&quot;emily.carter@mail.co.uk&quot;</S>,
    </>,
    <>
      {"  "}total: <N>60</N>, <C>{"// USDC"}</C>
    </>,
    <>
      {"  "}milestones: [{"{"} percent: <N>20</N> {"}"}, {"{"} percent: <N>60</N> {"}"}, {"{"} percent: <N>20</N> {"}"}],
    </>,
    <>{"}"}))</>,
    <></>,
    <>
      <K>await</K> fetch(<S>{"`/api/cases/${plan.id}`"}</S>, post({"{"}
    </>,
    <>
      {"  "}action: <S>&quot;complete&quot;</S>, idx: <N>1</N>,
    </>,
    <>
      {"  "}evidence: <S>&quot;4,050 grafts placed, photo report sent&quot;</S>,
    </>,
    <>{"}"}))</>,
  ];
  return (
    <div className="mx-auto mt-10 max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0d1426] text-left">
      <p className="border-b border-white/10 px-5 py-2.5 font-mono text-xs text-white/50">clinic.ts</p>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-7 text-white/85">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-5">
            <span className="w-4 shrink-0 text-right text-white/30">{i + 1}</span>
            <span>{l}</span>
          </div>
        ))}
      </pre>
    </div>
  );
}

const K = ({ children }: { children: React.ReactNode }) => <span className="text-[#c792ea]">{children}</span>;
const S = ({ children }: { children: React.ReactNode }) => <span className="text-mint">{children}</span>;
const N = ({ children }: { children: React.ReactNode }) => <span className="text-[#f7c46c]">{children}</span>;
const C = ({ children }: { children: React.ReactNode }) => <span className="text-white/40">{children}</span>;

export function ForClinics() {
  const { lang } = useLang();
  const tr = lang === "tr";
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-[#0a0f1f] px-6 py-16 text-center text-white">
        <Waves className="absolute inset-0 h-full w-full opacity-60" color="rgba(124,245,200,0.07)" />
        <div className="relative">
          <h2 className="font-display bg-linear-to-r from-[#b9a7ff] via-white to-mint bg-clip-text text-3xl text-transparent sm:text-5xl">
            {tr ? "Klinik mi işletiyorsun?" : "Running a clinic?"}
            <br />
            {tr ? "İki çağrıda aşamalı ödeme." : "Staged payments in two calls."}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-white/70">
            {tr
              ? "Planı oluştur, aşama bitince kanıtı gönder. Emanet kontratını, hastanın cüzdanını ve lira ödemesini hekim halleder."
              : "Create a plan, post evidence when a stage is done. hekim handles the escrow contract, the patient wallet and the lira payout."}
          </p>
          <Link href="/clinic" className="mt-6 inline-flex rounded-full bg-mint px-5 py-2.5 text-sm font-medium text-teal-2 hover:brightness-95">
            {tr ? "Klinik panelini aç" : "Open the clinic panel"}
          </Link>
          <Code />
        </div>
      </div>
    </section>
  );
}

const treatments = [
  { en: "Hair transplant", tr: "Saç ekimi", bg: "#c6f25e", ink: "#0b1b20", d: { en: "Arrival, procedure and day 7 check, paid only as each happens.", tr: "Varış, işlem ve 7. gün kontrolü; her biri gerçekleştikçe ödenir." }, s: [20, 60, 20] },
  { en: "Dental implants", tr: "Diş implantı", bg: "#6a4ee0", ink: "#fff", d: { en: "Two trips months apart. The final crowns stay in escrow until fitted.", tr: "Aylar arayla iki ziyaret. Son kronların parası takılana kadar emanette." }, s: [15, 45, 40] },
  { en: "Rhinoplasty", tr: "Rinoplasti", bg: "#22a36f", ink: "#fff", d: { en: "Pre-op tests, surgery and splint removal as three separate releases.", tr: "Ameliyat öncesi testler, ameliyat ve atel çıkarma üç ayrı ödeme." }, s: [20, 60, 20] },
  { en: "Eye surgery", tr: "Göz ameliyatı", bg: "#2f6de0", ink: "#fff", d: { en: "Diagnostics first, laser procedure second. Refund if the exam rules it out.", tr: "Önce tetkik, sonra lazer. Muayene uygun bulmazsa iade." }, s: [30, 70] },
  { en: "IVF cycle", tr: "Tüp bebek", bg: "#f0a6d6", ink: "#0b1b20", d: { en: "Stimulation, retrieval and transfer, each approved by the patient.", tr: "Uyarım, toplama ve transfer; her biri hasta onayıyla." }, s: [25, 35, 40] },
  { en: "Bariatric surgery", tr: "Obezite cerrahisi", bg: "#174a60", ink: "#fff", d: { en: "Assessment, surgery and a 30 day follow-up visit.", tr: "Değerlendirme, ameliyat ve 30. gün kontrolü." }, s: [20, 55, 25] },
];

export function Treatments() {
  const { lang } = useLang();
  const tr = lang === "tr";
  const rail = useRef<HTMLDivElement>(null);
  const move = (dir: number) => rail.current?.scrollBy({ left: dir * 320, behavior: "smooth" });
  return (
    <section className="py-20">
      <div className="mx-auto flex max-w-6xl items-end justify-between gap-4 px-4 sm:px-6">
        <h2 className="font-display text-3xl text-teal sm:text-4xl">
          {tr ? "hekim ile neler mümkün" : "See what's possible with hekim"}
        </h2>
        <div className="flex gap-2">
          {[-1, 1].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => move(d)}
              aria-label={d < 0 ? "Previous" : "Next"}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-teal/30 text-teal hover:bg-teal-soft"
            >
              {d < 0 ? "←" : "→"}
            </button>
          ))}
        </div>
      </div>
      <div ref={rail} className="mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:px-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]">
        {treatments.map((t) => (
          <article key={t.en} className="w-64 shrink-0 snap-start sm:w-72">
            <div className="flex h-40 flex-col justify-between rounded-2xl p-4" style={{ background: t.bg, color: t.ink }}>
              <h3 className="font-display text-2xl">{t[lang]}</h3>
              <div className="flex gap-1.5">
                {t.s.map((w, i) => (
                  <span key={i} className="h-2 rounded-full bg-current opacity-60" style={{ flex: w }} />
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm text-ink-2">{t.d[lang]}</p>
            <p className="mt-1 text-xs text-ink-3">
              {tr ? "Aşamalar" : "Stages"}: {t.s.map((x) => `${x}%`).join(" · ")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ControlBanner() {
  const { lang } = useLang();
  const tr = lang === "tr";
  return (
    <div className="mx-auto mt-14 flex max-w-6xl flex-wrap items-center justify-between gap-2 rounded-full bg-[#e6dcfb] px-6 py-3 text-sm text-ink">
      <span>
        {tr
          ? "Kontrol hastada: her ödeme, kendi cüzdanından imzaladığı onayı ister."
          : "Patients stay in control: every release needs their approval, signed from their own wallet."}
      </span>
      <Link href="/patient" className="font-medium text-violet hover:underline">
        {tr ? "Hasta portalını aç »" : "Open the patient portal »"}
      </Link>
    </div>
  );
}
