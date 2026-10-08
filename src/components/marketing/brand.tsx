import Link from "next/link";
import { Activity } from "lucide-react";
import { ToneChip } from "@/components/chrome/tone";

export function MarketingBrand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <ToneChip tone="start" icon={Activity} className="size-8" />
      <span className="font-heading text-[16px] font-semibold tracking-tight text-[#1b1f24]">Relay</span>
    </Link>
  );
}
