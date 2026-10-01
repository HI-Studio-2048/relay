import { zernioPlatformColor } from "@/components/chrome/platform-badge";
import { cn } from "@/lib/utils";

const PALETTE = ["#0084FF", "#7B61FF", "#00C2CB", "#E64980", "#12B886", "#F76707", "#4C6EF5"];

function hueFor(seed: string) {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}

function initials(name: string) {
  const parts = name.replace(/^@/, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Contact avatar: their profile picture when the platform sends one, otherwise initials. A dot marks the network. */
export function ContactAvatar({
  name,
  src,
  platform,
  className,
}: {
  name: string;
  src?: string | null;
  platform?: string | null;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex size-9 shrink-0", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- platform CDN avatars, not optimizable
        <img src={src} alt="" className="size-full rounded-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span
          className="flex size-full items-center justify-center rounded-full text-[12px] font-semibold text-white"
          style={{ background: hueFor(name) }}
        >
          {initials(name)}
        </span>
      )}
      {platform ? (
        <span
          className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white"
          style={{ background: zernioPlatformColor(platform) }}
        />
      ) : null}
    </span>
  );
}
