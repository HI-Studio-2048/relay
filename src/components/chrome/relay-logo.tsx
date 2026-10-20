import { cn } from "@/lib/utils";

// Same picture as the favicon (src/app/icon.png) and the TikTok app icon. Platform reviewers
// check that all three match, so change them together.
export function RelayLogo({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a 128px brand mark, nothing to optimize
    <img
      src="/brand/recatch-icon.png"
      alt="Recatch"
      width={128}
      height={128}
      className={cn("size-8 shrink-0", className)}
    />
  );
}
