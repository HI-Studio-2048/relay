import Link from "next/link";
import type { ReactNode } from "react";
import { ContactEmail } from "@/components/marketing/legal-page";
import { AFFILIATE_NAV, affiliateTermText, type AffiliateTerm } from "@/lib/affiliates";

export function AffiliatePage({
  current,
  eyebrow,
  title,
  lede,
  children,
}: {
  current: (typeof AFFILIATE_NAV)[number]["href"];
  eyebrow: string;
  title: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <article>
      <header className="border-b border-[#e5e7eb]">
        <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-8 md:px-8 md:pt-20">
          <p className="text-[12px] font-semibold tracking-[0.14em] text-[#0084ff] uppercase">{eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-heading text-[36px] leading-[1.08] font-semibold tracking-tight text-balance text-[#1b1f24] md:text-[48px]">
            {title}
          </h1>
          <div className="mt-4 max-w-2xl text-[17px] leading-relaxed text-pretty text-[#4b5563]">{lede}</div>
          <nav className="mt-8 flex flex-wrap gap-2" aria-label="Affiliate program">
            {AFFILIATE_NAV.map((item) => {
              const active = item.href === current;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "rounded-full bg-[#1b1f24] px-4 py-2 text-[14px] font-medium text-white"
                      : "rounded-full bg-white px-4 py-2 text-[14px] font-medium text-[#4b5563] ring-1 ring-[#e5e7eb] hover:text-[#1b1f24]"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-12 md:px-8 md:py-16">{children}</div>
    </article>
  );
}

/** Shown on every affiliate page so a TBD is never mistaken for a published term. */
export function UnpublishedNotice() {
  return (
    <p className="rounded-2xl bg-[#fff7ed] px-5 py-4 text-[14px] leading-relaxed text-[#9a3412] ring-1 ring-[#fdba74]">
      Recatch has not published affiliate rates, payout rules, a cookie window, an agreement, or a signup link.
      Every open term is marked <strong>TBD</strong>. These pages explain the program. They are not a contract, and a
      TBD is not a promise.
    </p>
  );
}

export function TermList({ terms }: { terms: readonly AffiliateTerm[] }) {
  return (
    <dl className="divide-y divide-[#e5e7eb] overflow-hidden rounded-2xl bg-white ring-1 ring-[#e5e7eb]">
      {terms.map((term) => (
        <div key={term.key} className="px-5 py-4 sm:grid sm:grid-cols-[16rem_1fr] sm:items-baseline sm:gap-6">
          <dt className="text-[14px] font-medium text-[#1b1f24]">{term.label}</dt>
          <dd className={term.value ? "text-[15px] text-[#374151]" : "text-[15px] font-semibold text-[#b54708]"}>
            {affiliateTermText(term)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AffiliateSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      {eyebrow ? (
        <p className="text-[12px] font-semibold tracking-[0.14em] text-[#0084ff] uppercase">{eyebrow}</p>
      ) : null}
      <h2 className="mt-2 font-heading text-[28px] leading-tight font-semibold tracking-tight text-[#1b1f24] md:text-[32px]">
        {title}
      </h2>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-[#374151]">{children}</div>
    </section>
  );
}

export function AffiliateQuestions() {
  return (
    <section className="rounded-2xl bg-[#f4f6f8] px-5 py-6 ring-1 ring-[#e5e7eb]">
      <h2 className="font-heading text-[20px] text-[#1b1f24]">Questions</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[#374151]">
        Write to <ContactEmail />. There is no separate affiliate address yet, and there is no affiliate dashboard
        inside Recatch.
      </p>
    </section>
  );
}
