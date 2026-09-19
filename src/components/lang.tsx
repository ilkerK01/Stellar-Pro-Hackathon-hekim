"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import { translate, type Key, type Lang } from "@/lib/i18n";

type LangContext = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<LangContext | null>(null);

let memory: Lang = "en";

function readLang(): Lang {
  try {
    const saved = localStorage.getItem("hekim-lang");
    if (saved === "en" || saved === "tr") return saved;
  } catch {}
  return memory;
}

function subscribe(onChange: () => void) {
  window.addEventListener("hekim-lang", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("hekim-lang", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => "en" as Lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      localStorage.setItem("hekim-lang", next);
    } catch {}
    memory = next;
    window.dispatchEvent(new Event("hekim-lang"));
  }, []);

  const value = useMemo<LangContext>(
    () => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }),
    [lang, setLang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang } = useLang();
  return (
    <div
      className={`inline-flex rounded-full p-0.5 text-xs font-medium ${
        dark ? "bg-white/10 text-white" : "bg-paper-2 text-ink-2"
      }`}
      role="group"
      aria-label="Language"
    >
      {(["en", "tr"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 uppercase transition ${
            lang === l ? (dark ? "bg-white text-teal-2" : "bg-ink text-white") : "opacity-70 hover:opacity-100"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
