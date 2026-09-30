import { useId } from "react";
import { cn } from "@/lib/utils";

// Fisherman casting into the water. Kept in sync with src/app/icon.svg (favicon).
export function RelayLogo({ className }: { className?: string }) {
  const clipId = useId();

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Relay"
      className={cn("size-8 shrink-0", className)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width="64" height="64" rx="16" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="64" height="64" fill="#0084ff" />
        <circle cx="36" cy="12" r="4.5" fill="#ffd166" />
        <path d="M25 30 Q40 14 53 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        <path d="M53 13 V41" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity=".85" />
        <path d="M14.5 18 Q20 11 25.5 18 Z" fill="#1b1f24" />
        <rect x="12.5" y="17.2" width="15" height="1.8" rx=".9" fill="#1b1f24" />
        <circle cx="20" cy="22" r="3.6" fill="#fff" />
        <path d="M14 46 V32 Q14 27 20 27 Q26 27 26 32 V46 Z" fill="#fff" />
        <path d="M23 32 L27 30" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <path d="M0 44 Q8 40 16 44 T32 44 T48 44 T64 44 V64 H0 Z" fill="#005fcc" />
        <path d="M0 53 Q8 49 16 53 T32 53 T48 53 T64 53 V64 H0 Z" fill="#004a9f" />
        <circle cx="53" cy="42.5" r="2.4" fill="#ff5a5f" stroke="#fff" strokeWidth="1" />
        <path
          d="M46 46 Q49.5 44.5 53 46 Q56.5 44.5 60 46"
          stroke="#fff"
          strokeWidth="1"
          strokeLinecap="round"
          opacity=".6"
        />
      </g>
    </svg>
  );
}
