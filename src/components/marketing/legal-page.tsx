import type { ReactNode } from "react";
import { LEGAL, legalContactEmail } from "@/lib/legal";

/** Shared shell for the privacy, terms and data deletion pages. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-14 md:px-8 md:py-20">
      <p className="text-[13px] text-[#6b7280]">Last updated {LEGAL.updated}</p>
      <h1 className="mt-2 font-heading text-[34px] leading-tight tracking-tight text-[#1b1f24] md:text-[42px]">{title}</h1>
      <div className="mt-5 text-[16px] leading-relaxed text-[#374151]">{intro}</div>
      <div className="mt-10 space-y-10">{children}</div>
    </article>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-[20px] text-[#1b1f24]">{heading}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-[#374151] [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

/** The contact address as a mailto link. Says plainly when it hasn't been configured yet. */
export function ContactEmail() {
  const email = legalContactEmail();
  if (!email) return <span className="text-[#b54708]">(contact email not configured)</span>;
  return (
    <a href={`mailto:${email}`} className="text-[#0084ff] hover:underline">
      {email}
    </a>
  );
}
