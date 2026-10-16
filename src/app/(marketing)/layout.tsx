import Link from "next/link";
import type { ReactNode } from "react";
import { MarketingBrand } from "@/components/marketing/brand";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb]/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-8">
          <MarketingBrand />
          <nav className="flex items-center gap-3 text-[14px] text-[#6b7280] md:gap-7">
            <a href="/welcome#features" className="hidden hover:text-[#1b1f24] md:inline">Features</a>
            <a href="/welcome#channels" className="hidden hover:text-[#1b1f24] md:inline">Channels</a>
            <a href="/welcome#how" className="hidden hover:text-[#1b1f24] md:inline">How it works</a>
            <Link href="/affiliates" className="hover:text-[#1b1f24]">Affiliates</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" render={<Link href="/login" />}>
              Log in
            </Button>
            <Button render={<Link href="/signup" />}>
              Get started
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[#e5e7eb] bg-[#f4f6f8]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-10 text-[13px] text-[#6b7280] md:flex-row md:items-center md:justify-between md:px-8">
          <MarketingBrand />
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/login" className="hover:text-[#1b1f24]">Log in</Link>
            <Link href="/signup" className="hover:text-[#1b1f24]">Create account</Link>
            <Link href="/affiliates" className="hover:text-[#1b1f24]">Affiliates</Link>
            <Link href="/privacy" className="hover:text-[#1b1f24]">Privacy</Link>
            <Link href="/terms" className="hover:text-[#1b1f24]">Terms</Link>
            <Link href="/data-deletion" className="hover:text-[#1b1f24]">Delete your data</Link>
          </div>
          <p>© {new Date().getFullYear()} Recatch</p>
        </div>
      </footer>
    </div>
  );
}
