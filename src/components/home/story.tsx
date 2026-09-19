"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLang } from "../lang";
import { Waves } from "./waves";

type L = { en: string; tr: string };

type Step = {
  bg: string;
  accent: string;
  title: L;
  body: L;
  cta: L;
  href: string;
  card: React.ReactNode;
  screen: React.ReactNode;
};

function PhoneButton({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="mt-auto rounded-lg py-2 text-center text-[10px] font-semibold text-white" style={{ background: color }}>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5 text-[10px] last:border-0">
      <span className="text-ink-2">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function useSteps(): Step[] {
  const { lang } = useLang();
  const tr = lang === "tr";
  return [
    {
      bg: "#13705f",
      accent: "#1f9d78",
      title: { en: "Patients onboard in seconds", tr: "Hasta saniyeler içinde katılır" },
      body: {
        en: "Foreign patients sign in with email. A Stellar wallet is created for them in the background with Privy.",
        tr: "Yabancı hasta e-postayla girer. Stellar cüzdanı arka planda Privy ile oluşturulur.",
      },
      cta: { en: "Open the patient portal", tr: "Hasta portalını aç" },
      href: "/patient",
      card: (
        <>
          <p className="text-[11px] text-ink-3">{tr ? "Cüzdan oluşturuldu" : "Wallet created"}</p>
          <p className="font-mono text-sm">GBVZ…N6SX</p>
          <p className="mt-1 text-xs text-green">{tr ? "USDC açık" : "USDC enabled"}</p>
        </>
      ),
      screen: (
        <div className="flex h-full flex-col">
          <div className="mx-auto mt-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#13705f] text-white">✓</div>
          <p className="mt-3 text-center text-[11px] font-semibold">
            {tr ? "Tedavi ödemeni güvenceye al" : "Secure your treatment payment"}
          </p>
          <p className="text-center text-[9px] text-ink-3">{tr ? "Cüzdan yok, seed ifadesi yok" : "No wallet, no seed phrase"}</p>
          <div className="mt-4 rounded-md border border-line px-2 py-1.5 text-[9px]">emily.carter@mail.co.uk</div>
          <div className="mt-1.5 rounded-md border border-line px-2 py-1.5 font-mono text-[9px] tracking-[0.4em]">417290</div>
          <PhoneButton color="#1f9d78">{tr ? "Devam" : "Continue"}</PhoneButton>
        </div>
      ),
    },
    {
      bg: "#2a4fb0",
      accent: "#2d5be3",
      title: { en: "Payments locked, not sent", tr: "Para gönderilmez, kilitlenir" },
      body: {
        en: "The full amount sits in a Soroban escrow. Neither the clinic nor hekim can move it alone.",
        tr: "Tutarın tamamı Soroban emanetinde durur. Ne klinik ne hekim onu tek başına oynatabilir.",
      },
      cta: { en: "See how it works", tr: "Nasıl çalıştığını gör" },
      href: "#how",
      card: (
        <>
          <p className="text-[11px] text-ink-3">{tr ? "Emanet kontratı" : "Escrow contract"}</p>
          <p className="font-mono text-sm">CDX4…7QPA</p>
          <div className="mt-2 flex gap-1">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 flex-1 rounded-full bg-[#2d5be3]" />
            ))}
          </div>
        </>
      ),
      screen: (
        <div className="flex h-full flex-col">
          <p className="mt-1 text-center text-[11px] font-semibold">{tr ? "Ödemeni kilitle" : "Lock your payment"}</p>
          <p className="text-center text-[9px] text-ink-3">{tr ? "İmplant · Bosphorus Dental" : "Implants · Bosphorus Dental"}</p>
          <p className="font-display mt-3 text-center text-2xl">60.00</p>
          <p className="text-center text-[9px] text-ink-3">{tr ? "USDC · emanette tutulur" : "USDC · held by escrow contract"}</p>
          <div className="mt-3">
            <Row label={tr ? "Varış ve muayene" : "Arrival and exam"} value="12.00" />
            <Row label={tr ? "Ameliyat" : "Procedure"} value="36.00" />
            <Row label={tr ? "7. gün kontrolü" : "Day 7 follow-up"} value="12.00" />
          </div>
          <PhoneButton color="#2d5be3">{tr ? "60.00 USDC kilitle" : "Lock 60.00 USDC"}</PhoneButton>
        </div>
      ),
    },
    {
      bg: "#5b3fc0",
      accent: "#6d4fe0",
      title: { en: "Paid stage by stage", tr: "Aşama aşama ödeme" },
      body: {
        en: "The clinic posts evidence, the patient approves from their phone, and that stage is released instantly.",
        tr: "Klinik kanıtı paylaşır, hasta telefonundan onaylar, o aşamanın parası anında geçer.",
      },
      cta: { en: "Try the clinic panel", tr: "Klinik panelini dene" },
      href: "/clinic",
      card: (
        <>
          <p className="text-[11px] text-ink-3">{tr ? "Ödendi" : "Released"}</p>
          <p className="text-sm font-semibold">36.00 USDC → {tr ? "klinik" : "clinic"}</p>
          <p className="mt-1 font-mono text-[11px] text-violet">tx 9a2f1c…</p>
        </>
      ),
      screen: (
        <div className="flex h-full flex-col">
          <p className="text-[9px] text-ink-3">{tr ? "Aşama 2 / 3" : "Stage 2 of 3"}</p>
          <p className="text-[11px] font-semibold">{tr ? "İşlem tamamlandı" : "Procedure completed"}</p>
          <div className="mt-2 rounded-md bg-amber-soft p-2 text-[9px] text-ink-2">
            {tr ? "İki implant yerleştirildi. Röntgen e-postana gönderildi." : "Two implants placed. X-ray report sent to your email."}
          </div>
          <div className="mt-2">
            <Row label={tr ? "Kliniğe ödenecek" : "Release to clinic"} value="36.00" />
            <Row label={tr ? "Emanette kalan" : "Still in escrow"} value="12.00" />
          </div>
          <PhoneButton color="#6d4fe0">{tr ? "Onayla ve öde" : "Approve and release"}</PhoneButton>
          <p className="mt-1.5 text-center text-[9px] text-coral">{tr ? "Sorun bildir" : "Report a problem"}</p>
        </div>
      ),
    },
    {
      bg: "#8a3b52",
      accent: "#b24a68",
      title: { en: "Problems go to an arbiter", tr: "Sorunu hakem çözer" },
      body: {
        en: "If a stage goes wrong the money stays locked. An independent arbiter refunds, pays or splits it.",
        tr: "Bir aşama ters giderse para kilitli kalır. Bağımsız hakem iade eder, öder ya da böler.",
      },
      cta: { en: "Open the arbiter desk", tr: "Hakem masasını aç" },
      href: "/arbiter",
      card: (
        <>
          <p className="text-[11px] text-ink-3">{tr ? "Hakem kararı" : "Arbiter decision"}</p>
          <p className="text-sm font-semibold">{tr ? "%50 hasta · %50 klinik" : "50% patient · 50% clinic"}</p>
          <p className="mt-1 text-[11px] text-green">{tr ? "Kontrat uyguladı" : "Enforced by the contract"}</p>
        </>
      ),
      screen: (
        <div className="flex h-full flex-col">
          <p className="text-[11px] font-semibold text-coral">{tr ? "İtiraz açıldı" : "Dispute opened"}</p>
          <p className="mt-1 rounded-md bg-coral-soft p-2 text-[9px] text-ink-2">
            {tr ? "İki implant yerine bir implant yapıldı." : "Only one implant was placed, not two."}
          </p>
          <p className="mt-3 text-[9px] text-ink-3">{tr ? "Hakem bölüşümü" : "Arbiter split"}</p>
          <div className="mt-1 flex h-2 overflow-hidden rounded-full">
            <span className="w-1/2 bg-violet" />
            <span className="w-1/2 bg-green" />
          </div>
          <div className="mt-1 flex justify-between text-[9px]">
            <span>{tr ? "Hasta 17.77" : "Patient 17.77"}</span>
            <span>{tr ? "Klinik 17.76" : "Clinic 17.76"}</span>
          </div>
          <PhoneButton color="#b24a68">{tr ? "Kararı uygula" : "Execute decision"}</PhoneButton>
        </div>
      ),
    },
    {
      bg: "#154b5c",
      accent: "#1c6b80",
      title: { en: "Lira in, lira out", tr: "Lira girer, lira çıkar" },
      body: {
        en: "Patients top up by bank transfer and clinics cash out to their bank in TRY through a Stellar anchor.",
        tr: "Hasta havaleyle yükler, klinik Stellar anchor'ı üzerinden bankasına TL olarak çeker.",
      },
      cta: { en: "See the corridors", tr: "Koridorları gör" },
      href: "#corridors",
      card: (
        <>
          <p className="text-[11px] text-ink-3">{tr ? "SEP-6 çekim" : "SEP-6 withdrawal"}</p>
          <p className="text-sm font-semibold">₺97.08 {tr ? "ödendi" : "paid"}</p>
          <p className="mt-1 text-[11px] text-green">{tr ? "Saniyeler içinde tamamlandı" : "Completed in seconds"}</p>
        </>
      ),
      screen: (
        <div className="flex h-full flex-col">
          <p className="text-[9px] text-ink-3">{tr ? "Klinik cüzdanı" : "Clinic wallet"}</p>
          <p className="font-display text-xl">48.00 USDC</p>
          <p className="text-[9px] text-ink-3">≈ ₺2,329 · 1 USDC = ₺48.54</p>
          <div className="mt-3 flex h-20 items-end gap-1.5">
            {[35, 55, 45, 70, 60, 85, 75].map((h, i) => (
              <span key={i} className="flex-1 rounded-t bg-[#1c6b80]" style={{ height: `${h}%` }} />
            ))}
          </div>
          <p className="mt-1 text-center text-[8px] text-ink-3">{tr ? "Haftalık TRY ödemeleri" : "Weekly payouts in TRY"}</p>
          <PhoneButton color="#154b5c">{tr ? "Bankaya TL olarak çek" : "Withdraw to bank as TRY"}</PhoneButton>
        </div>
      ),
    },
  ];
}

export function Story() {
  const { lang } = useLang();
  const steps = useSteps();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const span = el.offsetHeight - window.innerHeight;
      const progress = span > 0 ? Math.min(0.999, Math.max(0, -rect.top / span)) : 0;
      setActive(Math.floor(progress * steps.length));
      setScale(Math.min(1, Math.max(0.55, (window.innerHeight - 300) / 430)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [steps.length]);

  const step = steps[active];

  return (
    <section id="how" ref={ref} className="relative scroll-mt-0" style={{ height: `${steps.length * 90}svh` }}>
      <div
        className="sticky top-0 flex h-svh flex-col items-center justify-center overflow-hidden px-4 text-white transition-colors duration-700"
        style={{ background: step.bg }}
      >
        <Waves className="absolute inset-0 h-full w-full opacity-70" />
        <div className="relative flex w-full max-w-3xl flex-col items-center pt-14">
          <div className="relative" style={{ height: 400 * scale, width: 200 * scale }}>
            <div
              className="absolute top-0 left-0 origin-top-left"
              style={{ transform: `scale(${scale})`, width: 200, height: 400 }}
            >
              <div className="relative h-[400px] w-[200px] rounded-[30px] border-[6px] border-ink bg-white p-3 pt-8 text-ink shadow-2xl shadow-black/30">
                <span className="absolute top-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-ink" />
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className={`absolute inset-3 top-8 transition-all duration-500 ${
                      i === active ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0"
                    }`}
                  >
                    {s.screen}
                  </div>
                ))}
              </div>
            </div>
            {steps.map((s, i) => (
              <div
                key={i}
                className={`absolute top-[18%] right-[calc(100%-16px)] hidden w-48 rounded-2xl bg-white/95 p-3.5 text-ink shadow-xl transition-all duration-500 sm:block ${
                  i === active ? "opacity-100" : "pointer-events-none -translate-x-3 opacity-0"
                }`}
              >
                {s.card}
              </div>
            ))}
          </div>
          <div className="relative mt-6 grid w-full text-center">
            {steps.map((s, i) => (
              <div
                key={i}
                className={`col-start-1 row-start-1 transition-all duration-500 ${
                  i === active ? "opacity-100" : "pointer-events-none translate-y-3 opacity-0"
                }`}
                aria-hidden={i !== active}
              >
                <h2 className="font-display text-3xl sm:text-4xl">{s.title[lang]}</h2>
                <p className="mx-auto mt-3 max-w-xl text-white/85">{s.body[lang]}</p>
                <Link
                  href={s.href}
                  className="mt-5 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper-2"
                  tabIndex={i === active ? 0 : -1}
                >
                  {s.cta[lang]}
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full bg-white transition-all ${i === active ? "w-8" : "w-1.5 opacity-50"}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
