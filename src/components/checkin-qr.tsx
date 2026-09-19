"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useLang } from "./lang";
import { Button, Copy } from "./ui";

export function CheckinQr({
  caseId,
  idx,
  nonce,
  expiresAt,
  onRenew,
  busy,
}: {
  caseId: string;
  idx: number;
  nonce: string;
  expiresAt: string;
  onRenew: () => void;
  busy: boolean;
}) {
  const { t, lang } = useLang();
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = `${origin}/patient/case/${caseId}?stage=${idx}&checkin=${nonce}`;
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    if (!origin) return;
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#0e3f52", light: "#ffffff" } })
      .then(setImage)
      .catch(() => setImage(null));
  }, [url, origin]);

  return (
    <div className="grid gap-4 rounded-2xl border border-teal/20 bg-white p-4 sm:grid-cols-[180px_1fr]">
      <div className="mx-auto aspect-square w-44 overflow-hidden rounded-xl border border-line bg-white p-2">
        {image && <Image src={image} alt={t("clinic.checkinTitle")} width={160} height={160} unoptimized className="h-full w-full" />}
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <p className="font-display text-lg">{t("clinic.checkinTitle")}</p>
        <p className="text-ink-2">{t("clinic.checkinBody")}</p>
        <p className="text-xs text-ink-3">
          {new Date(expiresAt).toLocaleTimeString(lang === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <p className="text-xs text-ink-3">{t("clinic.checkinLink")}</p>
        <div className="flex items-center gap-2 rounded-xl bg-paper px-3 py-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{url}</span>
          <Copy value={url} />
        </div>
        <Button size="sm" variant="outline" busy={busy} onClick={onRenew}>
          {t("clinic.checkinNew")}
        </Button>
      </div>
    </div>
  );
}
