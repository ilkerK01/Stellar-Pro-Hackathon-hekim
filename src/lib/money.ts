const SCALE = 10_000_000n;

export function toStroops(value: string | number): bigint {
  const text = typeof value === "number" ? value.toFixed(7) : value.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) throw new Error(`Invalid amount: ${value}`);
  const [whole, frac = ""] = text.split(".");
  return BigInt(whole) * SCALE + BigInt((frac + "0000000").slice(0, 7));
}

export function fromStroops(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export function percentOf(value: bigint, basisPoints: bigint): bigint {
  return (value * basisPoints) / 10_000n;
}

export function formatUsdc(value: string | number | null | undefined, digits = 2): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatTry(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
