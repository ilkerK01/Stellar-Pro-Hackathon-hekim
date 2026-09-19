"use client";

import { useState } from "react";
import { useLang } from "./lang";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "dark" | "light" | "outline" | "danger" | "mint" | "ghost";
  busy?: boolean;
  size?: "sm" | "md";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  dark: "bg-ink text-white hover:bg-teal-2",
  light: "bg-white text-ink hover:bg-paper-2",
  outline: "border border-line bg-white text-ink hover:border-ink-3",
  danger: "border border-coral/30 bg-coral-soft text-coral hover:border-coral",
  mint: "bg-mint text-teal-2 hover:brightness-95",
  ghost: "text-ink-2 hover:bg-paper-2",
};

export function Button({ variant = "dark", busy, size = "md", className = "", children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "px-3.5 py-1.5 text-sm" : "px-5 py-2.5 text-sm"
      } ${variants[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`rounded-3xl border border-line bg-card p-5 sm:p-6 ${className}`}>{children}</section>;
}

type Tone = "neutral" | "teal" | "amber" | "coral" | "green" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-paper-2 text-ink-2",
  teal: "bg-teal-soft text-teal-2",
  amber: "bg-amber-soft text-amber",
  coral: "bg-coral-soft text-coral",
  green: "bg-green-soft text-green",
  violet: "bg-violet-soft text-violet",
};

export function Badge({ tone = "neutral", children, pulse }: { tone?: Tone; children: React.ReactNode; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${tones[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "pulse-ring" : ""}`} />
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <div className={`rounded-2xl px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-ink-3 focus:border-teal focus:ring-4 focus:ring-teal/10";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputClass} resize-none ${props.className ?? ""}`} />;
}

export function short(value: string, head = 6, tail = 4) {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  const { t } = useLang();
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
      title={t("common.viewTx")}
    >
      {label ?? short(hash, 8, 6)}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export function ContractLink({ id }: { id: string }) {
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/contract/${id}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
    >
      {short(id, 6, 6)}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export function Copy({ value, className = "" }: { value: string; className?: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`rounded-full bg-paper-2 px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-line ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? t("common.copied") : t("common.copy")}
    </button>
  );
}

export function AppHero({
  kicker,
  title,
  subtitle,
  tone = "teal",
  children,
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  tone?: "teal" | "violet";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`waves overflow-hidden text-white ${
        tone === "violet"
          ? "bg-linear-to-br from-[#2b2170] via-[#4b3aa8] to-[#5b47c9]"
          : "bg-linear-to-br from-teal-2 via-teal to-[#15948a]"
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-20 sm:px-6">
        {kicker && <p className="mb-2 text-xs font-medium tracking-wide text-mint">{kicker}</p>}
        <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-white/75">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-xl bg-coral-soft px-3 py-2 text-sm text-coral">
      {error}
    </p>
  );
}
