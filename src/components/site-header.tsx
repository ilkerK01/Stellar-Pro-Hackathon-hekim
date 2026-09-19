"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangToggle, useLang } from "./lang";
import { Logo } from "./logo";

export function SiteHeader({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { t } = useLang();
  const path = usePathname();
  const dark = tone === "dark";
  const apps = [
    { href: "/patient", label: t("nav.patient") },
    { href: "/clinic", label: t("nav.clinic") },
    { href: "/arbiter", label: t("nav.arbiter") },
  ];
  return (
    <header
      className={`sticky top-0 z-40 ${
        dark ? "bg-teal-hero/90 text-white backdrop-blur" : "border-b border-line bg-white/80 backdrop-blur"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="hekim home">
          <Logo dark={dark} />
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <Link href="/#how" className={`rounded-full px-3 py-1.5 ${dark ? "hover:bg-white/10" : "hover:bg-paper-2"}`}>
            {t("nav.how")}
          </Link>
          <Link href="/#registry" className={`rounded-full px-3 py-1.5 ${dark ? "hover:bg-white/10" : "hover:bg-paper-2"}`}>
            {t("nav.registry")}
          </Link>
          <Link href="/#pricing" className={`rounded-full px-3 py-1.5 ${dark ? "hover:bg-white/10" : "hover:bg-paper-2"}`}>
            {t("nav.pricing")}
          </Link>
          <span className={`mx-2 h-5 w-px ${dark ? "bg-white/20" : "bg-line"}`} />
          {apps.map((a) => {
            const active = path.startsWith(a.href);
            return (
              <Link
                key={a.href}
                href={a.href}
                className={`rounded-full px-3 py-1.5 transition ${
                  active
                    ? dark
                      ? "bg-white text-teal-2"
                      : "bg-ink text-white"
                    : dark
                      ? "hover:bg-white/10"
                      : "hover:bg-paper-2"
                }`}
              >
                {a.label}
              </Link>
            );
          })}
        </nav>
        <LangToggle dark={dark} />
      </div>
      <nav className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 pb-2.5 text-sm md:hidden">
        {apps.map((a) => {
          const active = path.startsWith(a.href);
          return (
            <Link
              key={a.href}
              href={a.href}
              className={`shrink-0 rounded-full px-3 py-1 ${
                active
                  ? dark
                    ? "bg-white text-teal-2"
                    : "bg-ink text-white"
                  : dark
                    ? "bg-white/10"
                    : "bg-paper-2"
              }`}
            >
              {a.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  const { t, lang } = useLang();
  const tr = lang === "tr";
  const cols: { title: string; links: [string, string][] }[] = [
    {
      title: tr ? "Ürün" : "Product",
      links: [
        [tr ? "Aşamalı emanet" : "Staged escrow", "/#how"],
        [tr ? "Hasta portalı" : "Patient portal", "/patient"],
        [tr ? "Klinik paneli" : "Clinic panel", "/clinic"],
        [tr ? "Hakem masası" : "Arbiter desk", "/arbiter"],
      ],
    },
    {
      title: tr ? "Tedaviler" : "Treatments",
      links: [
        [tr ? "Saç ekimi" : "Hair transplant", "/clinic"],
        [tr ? "Diş implantı" : "Dental implants", "/clinic"],
        [tr ? "Rinoplasti" : "Rhinoplasty", "/clinic"],
        [tr ? "Göz ameliyatı" : "Eye surgery", "/clinic"],
      ],
    },
    {
      title: "hekim",
      links: [
        [tr ? "Neden hekim" : "Why hekim", "/#why"],
        [t("nav.registry"), "/#registry"],
        [t("nav.pricing"), "/#pricing"],
        [tr ? "Koridorlar" : "Corridors", "/#corridors"],
      ],
    },
    {
      title: tr ? "Altyapı" : "Built on",
      links: [
        ["Stellar", "https://stellar.org"],
        ["Trustless Work", "https://www.trustlesswork.com"],
        ["Privy", "https://privy.io"],
        ["Stellar Expert", "https://stellar.expert/explorer/testnet"],
      ],
    },
  ];
  return (
    <footer className="mt-auto bg-ink text-white/70">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_repeat(4,1fr)]">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm">
            {tr
              ? "Sağlık turizmi için aşamalı ödeme güvencesi. Para yalnızca tedavi gerçekleştikçe hareket eder."
              : "Staged payment protection for medical tourism. Money moves only as treatment happens."}
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="mb-3 text-sm font-medium text-white">{c.title}</p>
            <ul className="space-y-2 text-sm">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith("http") ? (
                    <a href={href} target="_blank" rel="noreferrer" className="hover:text-white">
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className="hover:text-white">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-white/50 sm:px-6">
          <span>© 2026 hekim · Rise In x Stellar Pro Hackathon, Istanbul</span>
          <span>{t("footer.note").split(".")[0]}.</span>
        </div>
      </div>
    </footer>
  );
}

export function FloatingNav() {
  const { t } = useLang();
  return (
    <div className="fixed inset-x-0 top-3 z-50 px-3 sm:top-5 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 rounded-full bg-white/75 py-2 pr-2 pl-4 text-ink shadow-lg shadow-black/10 backdrop-blur-md sm:pl-6">
        <Link href="/" aria-label="hekim home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 text-sm lg:flex">
          <Link href="/#how" className="rounded-full px-3 py-1.5 hover:bg-black/5">
            {t("nav.how")}
          </Link>
          <Link href="/#registry" className="rounded-full px-3 py-1.5 hover:bg-black/5">
            {t("nav.registry")}
          </Link>
          <Link href="/#pricing" className="rounded-full px-3 py-1.5 hover:bg-black/5">
            {t("nav.pricing")}
          </Link>
          <Link href="/arbiter" className="rounded-full px-3 py-1.5 hover:bg-black/5">
            {t("nav.arbiter")}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LangToggle />
          <Link
            href="/patient"
            className="hidden rounded-full border border-ink/15 px-4 py-2 text-sm font-medium hover:border-ink/40 sm:inline-flex"
          >
            {t("nav.login")}
          </Link>
          <Link href="/clinic" className="rounded-full bg-ink px-4 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-teal-2">
            {t("nav.clinicPanel")}
          </Link>
        </div>
      </div>
    </div>
  );
}
