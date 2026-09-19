"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatTry, formatUsdc } from "@/lib/money";
import type { Ramp, Signable } from "@/lib/types";
import { useLang } from "../lang";
import { Button, Copy, ErrorText, Field, Input, Notice } from "../ui";
import { usePatient } from "./wallet";

type Rates = { buy: string; sell: string; minTry: string; maxTry: string; minUsdc: string } | null;
type Instructions = { id: string; how?: string; instructions?: Record<string, { value: string; description?: string }> };

export function TopUp({ caseId, suggestUsdc }: { caseId?: string; suggestUsdc?: number }) {
  const { t } = useLang();
  const { address, anchorSession, sign, refresh, ramps } = usePatient();
  const [tab, setTab] = useState<"try" | "usdc">("try");
  const [rates, setRates] = useState<Rates>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ ramp: Ramp; instructions: Instructions } | null>(null);

  useEffect(() => {
    api<{ rates: Rates }>("/api/config").then((r) => setRates(r.rates)).catch(() => null);
  }, []);

  const suggested =
    rates && suggestUsdc
      ? String(Math.min(Math.max(Math.ceil(suggestUsdc * Number(rates.buy) * 1.01), Number(rates.minTry)), Number(rates.maxTry)))
      : "";
  const amount = typed ?? suggested;

  const active = ramps.find((r) => r.kind === "deposit" && r.status !== "completed" && r.status !== "error");

  useEffect(() => {
    if (!active || active.status === "pending_user_transfer_start") return;
    const id = setTimeout(async () => {
      await api("/api/anchor", { body: { action: "refresh", address, rampId: active.id } }).catch(() => null);
      refresh();
    }, 4000);
    return () => clearTimeout(id);
  }, [active, address, refresh]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("connect", async () => {
      const { signable } = await api<{ signable: Signable }>("/api/anchor", { body: { action: "challenge", address } });
      const signedXdr = await sign(signable);
      await api("/api/anchor", { body: { action: "token", address, signedXdr } });
      await refresh();
    });

  const start = () =>
    run("start", async () => {
      const res = await api<{ ramp: Ramp; instructions: Instructions }>("/api/anchor", {
        body: { action: "deposit", address, amountTry: amount, caseId },
      });
      setPending(res);
      await refresh();
    });

  const simulate = (rampId: string) =>
    run("simulate", async () => {
      await api("/api/anchor", { body: { action: "simulate", address, rampId } });
      setPending(null);
      await refresh();
    });

  const estimate = rates && amount ? Number(amount) / Number(rates.buy) : 0;
  const waitingTransfer = pending ?? (active?.status === "pending_user_transfer_start" ? { ramp: active, instructions: null } : null);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full bg-paper-2 p-0.5 text-sm">
        {(["try", "usdc"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-full px-3.5 py-1.5 ${tab === k ? "bg-white shadow-sm" : "text-ink-2"}`}
          >
            {k === "try" ? t("patient.topupTry") : t("patient.topupUsdc")}
          </button>
        ))}
      </div>

      {tab === "usdc" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{t("patient.topupUsdcBody")}</p>
          <div className="flex items-center gap-2 rounded-2xl bg-paper px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{address}</span>
            {address && <Copy value={address} />}
          </div>
          <p className="text-xs text-ink-3">Stellar · USDC · GBBD47…LFLA5</p>
        </div>
      ) : !anchorSession ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-2">{t("patient.anchorHint")}</p>
          <Button busy={busy === "connect"} onClick={connect}>
            {t("patient.anchorLogin")}
          </Button>
        </div>
      ) : waitingTransfer ? (
        <div className="space-y-3">
          <Notice tone="amber">
            <p className="font-medium">{t("patient.bankDetails")}</p>
            {waitingTransfer.instructions?.instructions ? (
              <dl className="mt-2 space-y-1 text-xs">
                {Object.entries(waitingTransfer.instructions.instructions).map(([k, v]) => (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <dt className="text-ink-3">{v.description ?? k}</dt>
                    <dd className="font-mono text-ink">{v.value}</dd>
                    <Copy value={v.value} />
                  </div>
                ))}
              </dl>
            ) : (
              waitingTransfer.instructions?.how && <p className="mt-1 text-xs">{waitingTransfer.instructions.how}</p>
            )}
            <p className="mt-2 text-xs">{formatTry(waitingTransfer.ramp.amountIn)} TL</p>
          </Notice>
          <Button busy={busy === "simulate"} onClick={() => simulate(waitingTransfer.ramp.id)}>
            {t("patient.simulate")}
          </Button>
          <p className="text-xs text-ink-3">{t("patient.simulateHint")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <Field
            label={t("patient.amountTry")}
            hint={
              rates
                ? `${t("patient.rate", { rate: Number(rates.buy).toFixed(2) })} · ${t("patient.limits", {
                    min: Number(rates.minTry),
                    max: Number(rates.maxTry),
                  })}`
                : undefined
            }
          >
            <div className="flex gap-2">
              <Input
                type="number"
                min={rates?.minTry ?? 50}
                max={rates?.maxTry ?? 3000}
                value={amount}
                onChange={(e) => setTyped(e.target.value)}
              />
              <Button busy={busy === "start"} disabled={!amount} onClick={start}>
                {t("patient.startTransfer")}
              </Button>
            </div>
          </Field>
          {estimate > 0 && <p className="text-sm text-ink-2">≈ {formatUsdc(estimate)} USDC</p>}
        </div>
      )}
      <ErrorText error={error} />

      {ramps.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-ink-3">{t("patient.transfers")}</p>
          <ul className="space-y-1 text-sm">
            {ramps.slice(0, 4).map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span>
                  {formatTry(r.amountIn)} TL → {r.amountOut ? `${formatUsdc(r.amountOut)} USDC` : "…"}
                </span>
                <span className={`text-xs ${r.status === "completed" ? "text-green" : "text-ink-3"}`}>
                  {r.status.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
