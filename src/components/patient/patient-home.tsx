"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { formatUsdc } from "@/lib/money";
import type { CaseView, Signable } from "@/lib/types";
import { CaseStatusBadge } from "../case-parts";
import { useLang } from "../lang";
import { SiteFooter, SiteHeader } from "../site-header";
import { AppHero, Button, Card, Copy, ErrorText, Spinner } from "../ui";
import { TopUp } from "./topup";
import { usePatient } from "./wallet";

export function WalletCard({ compact = false }: { compact?: boolean }) {
  const { t } = useLang();
  const { address, wallet, sign, refresh, email, logout } = usePatient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsActivation = wallet && (!wallet.exists || wallet.usdc === null);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ink-3">{t("patient.wallet")}</p>
          <p className="font-display text-3xl">
            {formatUsdc(wallet?.usdc ?? 0)} <span className="text-sm text-ink-3">USDC</span>
          </p>
        </div>
        {!compact && (
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            {t("patient.logout")}
          </Button>
        )}
      </div>
      {address && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-paper px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2">{address}</span>
          <Copy value={address} />
        </div>
      )}
      {email && !compact && <p className="mt-2 text-xs text-ink-3">{email}</p>}
      {needsActivation && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-ink-2">{t("patient.activateHint")}</p>
          <Button
            busy={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res = await api<{ signable?: Signable }>(`/api/wallet/${address}`, { body: { action: "activate" } });
                if (res.signable) {
                  const signedXdr = await sign(res.signable);
                  await api(`/api/wallet/${address}`, { body: { action: "trustline", signedXdr } });
                }
                await refresh();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("patient.activate")}
          </Button>
          <ErrorText error={error} />
        </div>
      )}
    </Card>
  );
}

function SignIn() {
  const { t } = useLang();
  const { login, ready } = usePatient();
  return (
    <Card className="grid items-center gap-6 md:grid-cols-[1fr_0.7fr]">
      <div>
        <h2 className="font-display text-2xl">{t("patient.login")}</h2>
        <p className="mt-2 text-ink-2">{t("patient.subtitle")}</p>
        <Button className="mt-6" variant="dark" disabled={!ready} onClick={login}>
          {!ready && <Spinner />}
          {t("patient.login")}
        </Button>
      </div>
      <div className="relative mx-auto aspect-[4/5] w-full max-w-[240px] overflow-hidden rounded-3xl">
        <Image src="/brand/patient.webp" alt="" fill sizes="240px" className="object-cover" />
      </div>
    </Card>
  );
}

function CreateWallet() {
  const { t } = useLang();
  const { createWallet } = usePatient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <Button
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await createWallet();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("patient.creatingWallet") : t("patient.createWallet")}
      </Button>
      <ErrorText error={error} />
    </Card>
  );
}

function Plans() {
  const { t } = useLang();
  const { email, address } = usePatient();
  const [cases, setCases] = useState<CaseView[] | null>(null);

  const load = useCallback(() => {
    if (!email) return;
    const q = new URLSearchParams({ email, ...(address ? { address } : {}) });
    api<{ cases: CaseView[] }>(`/api/cases?${q}`).then((r) => setCases(r.cases)).catch(() => setCases([]));
  }, [email, address]);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <Card>
      <h2 className="mb-3 font-display text-xl">{t("patient.plans", { email: email ?? "" })}</h2>
      {!cases ? (
        <p className="text-sm text-ink-3">{t("common.loading")}…</p>
      ) : !cases.length ? (
        <p className="text-sm text-ink-3">{t("patient.noPlans")}</p>
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => {
            const action = c.milestones.some((m) => m.status === "completed") || c.status === "open" || c.status === "accepted";
            return (
              <li key={c.id}>
                <Link
                  href={`/patient/case/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 transition hover:border-teal"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.title}</p>
                    <p className="text-xs text-ink-3">
                      {c.clinicName} · {formatUsdc(c.total)} USDC · <span className="font-mono">{c.id}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {action && <span className="pulse-ring h-2 w-2 rounded-full bg-amber" />}
                    <CaseStatusBadge status={c.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function PatientHome() {
  const { t } = useLang();
  const { ready, authenticated, address } = usePatient();
  return (
    <>
      <SiteHeader />
      <AppHero title={t("patient.title")} subtitle={t("patient.subtitle")} />
      <main className="relative mx-auto -mt-12 w-full max-w-5xl space-y-5 px-4 pb-16 sm:px-6">
        {!ready ? (
          <Card>
            <p className="flex items-center gap-2 text-sm text-ink-3">
              <Spinner /> {t("common.loading")}
            </p>
          </Card>
        ) : !authenticated ? (
          <SignIn />
        ) : !address ? (
          <CreateWallet />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <Plans />
            <div className="space-y-5">
              <WalletCard />
              <Card>
                <h3 className="mb-3 font-medium">{t("patient.topup")}</h3>
                <TopUp />
              </Card>
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
