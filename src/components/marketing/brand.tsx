import Link from "next/link";
import { RelayLogo } from "@/components/chrome/relay-logo";

export function MarketingBrand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <RelayLogo />
      <span className="font-heading text-[16px] font-semibold tracking-tight text-[#1b1f24]">Recatch</span>
    </Link>
  );
}
