export function Waves({ className = "", count = 34, color = "rgba(255,255,255,0.13)" }: { className?: string; count?: number; color?: string }) {
  return (
    <svg className={`pointer-events-none ${className}`} viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <path
          key={i}
          d={`M-50 ${260 + i * 6} C 380 ${60 + i * 14}, 900 ${720 - i * 9}, 1650 ${300 + i * 8}`}
          fill="none"
          stroke={color}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}
