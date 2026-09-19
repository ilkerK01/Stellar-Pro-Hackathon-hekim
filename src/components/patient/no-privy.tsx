"use client";

import { useLang } from "../lang";
import { SiteFooter, SiteHeader } from "../site-header";
import { AppHero, Card, Notice } from "../ui";

export function NoPrivy() {
  const { t } = useLang();
  return (
    <>
      <SiteHeader />
      <AppHero title={t("patient.title")} subtitle={t("patient.subtitle")} />
      <main className="relative mx-auto -mt-12 w-full max-w-5xl px-4 pb-16 sm:px-6">
        <Card>
          <Notice tone="amber">{t("config.privy")}</Notice>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
