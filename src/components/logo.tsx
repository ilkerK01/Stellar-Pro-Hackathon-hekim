import { useId } from "react";

export function Mark({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0E3F52" />
          <stop offset="0.55" stopColor="#12546C" />
          <stop offset="1" stopColor="#15948A" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="17" fill={`url(#${id})`} />
      <path d="M20 16v32M44 16v32" stroke="#FFFFFF" strokeWidth="6.5" strokeLinecap="round" />
      <path
        d="M20 33.5l7.5 7L44 25"
        fill="none"
        stroke="#7CF5C8"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ dark = false, size = 28 }: { dark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Mark size={size} />
      <span
        className={`font-brand text-[1.45rem] leading-none font-semibold ${dark ? "text-white" : "text-ink"}`}
      >
        hekim
      </span>
    </span>
  );
}
