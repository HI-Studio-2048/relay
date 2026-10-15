import Link from "next/link";
import { ArrowRight, BadgePercent, Megaphone, UserPlus } from "lucide-react";
import { AffiliatePage, AffiliateQuestions, AffiliateSection, UnpublishedNotice } from "@/components/marketing/affiliate-page";
import { Button } from "@/components/ui/button";
import { affiliateMetadata, affiliateTerm, affiliateTermText } from "@/lib/affiliates";

/** Reads PUBLIC_CONTACT_EMAIL per request, so changing it on the host needs no rebuild. */
export const dynamic = "force-dynamic";

export const metadata = affiliateMetadata({
  title: "How the Recatch affiliate program works",
  description:
    "How to earn by introducing businesses to Recatch. Commission, cookie window, payouts, and the signup link are not published yet and are marked TBD.",
  path: "/affiliates",
});

const STEPS = [
  {
    title: "Share Recatch with a business",
    body: "Recatch is chat automation for teams that live in DMs: visual flows, comment-to-DM, a shared inbox, broadcasts, CRM, and AI replies on Telegram, Instagram, Messenger, and WhatsApp. Slack, Discord, and Bluesky connect too.",
  },
  {
    title: "They sign up through your link",
    body: `${affiliateTermText(affiliateTerm("signupUrl"))}. A normal account created at recatch.app/signup is not an affiliate referral, because no tracking link has been published.`,
  },
  {
    title: "The signup is attributed to you",
    body: `${affiliateTermText(affiliateTerm("cookieWindow"))}. Recatch has no affiliate cookie in the product today, so this window is unset.`,
  },
  {
    title: "You earn when a sale qualifies",
    body: `${affiliateTermText(affiliateTerm("commissionRate"))}. ${affiliateTermText(affiliateTerm("qualifyingSale"))}. The terms of service say that if a customer is on a paid plan, the price is shown at signup. This repo has no price list, and no affiliate cut of that price.`,
  },
  {
    title: "Recatch pays you",
    body: `${affiliateTermText(affiliateTerm("payoutSchedule"))}. ${affiliateTermText(affiliateTerm("payoutMinimum"))}. ${affiliateTermText(affiliateTerm("payoutMethod"))}.`,
  },
];

export default function AffiliatesPage() {
  return (
    <AffiliatePage
      current="/affiliates"
      eyebrow="Affiliate program"
      title="Earn when a business you send to Recatch starts paying."
      lede={
        <p>
          Introduce Recatch to people who run Telegram, Instagram, or WhatsApp for a business. When a referral becomes
          a paying customer and the sale qualifies, you earn a commission. The amounts and the rules are not published
          yet.
        </p>
      }
    >
      <UnpublishedNotice />

      <AffiliateSection eyebrow="How it works" title="From a share to a payout">
        <ol className="grid gap-4 md:grid-cols-2">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-2xl bg-white p-5 ring-1 ring-[#e5e7eb]">
              <p className="font-heading text-[13px] font-semibold text-[#c9d1da] tabular-nums">0{index + 1}</p>
              <h3 className="mt-2 text-[16px] font-semibold text-[#1b1f24]">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">{step.body}</p>
            </li>
          ))}
        </ol>
      </AffiliateSection>

      <AffiliateSection title="What is already true">
        <ul className="grid gap-4 sm:grid-cols-3">
          <li className="rounded-2xl bg-[#f4f6f8] p-5">
            <BadgePercent className="size-5 text-[#0084ff]" />
            <h3 className="mt-3 text-[16px] font-semibold text-[#1b1f24]">No rate you can quote</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
              {affiliateTermText(affiliateTerm("commissionRate"))}. {affiliateTermText(affiliateTerm("commissionBasis"))}.{" "}
              {affiliateTermText(affiliateTerm("qualifyingSale"))}.
            </p>
          </li>
          <li className="rounded-2xl bg-[#f4f6f8] p-5">
            <UserPlus className="size-5 text-[#0084ff]" />
            <h3 className="mt-3 text-[16px] font-semibold text-[#1b1f24]">There is no application form yet</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
              {affiliateTermText(affiliateTerm("signupUrl"))}. Creating a Recatch account lets you learn the product. It
              does not enroll you as an affiliate.
            </p>
          </li>
          <li className="rounded-2xl bg-[#f4f6f8] p-5">
            <Megaphone className="size-5 text-[#0084ff]" />
            <h3 className="mt-3 text-[16px] font-semibold text-[#1b1f24]">The product you promote is live</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
              Flows, the shared inbox, growth links, QR codes, and starter templates are in the product today. The{" "}
              <Link href="/affiliates/promote" className="text-[#0084ff] hover:underline">
                promotion guide
              </Link>{" "}
              is built from those.
            </p>
          </li>
        </ul>
      </AffiliateSection>

      <AffiliateSection title="Who this is for">
        <p>
          Agencies already get an All accounts view in Recatch, with every brand side by side. The same audience is a
          natural fit for affiliates: freelancers who set up chat automation, people who teach Instagram and Telegram
          marketing, and anyone whose audience asks how to turn comments and story replies into conversations.
        </p>
        <p>
          {affiliateTermText(affiliateTerm("eligibility"))}. Until that is filled in, treat the list above as a
          description of who Recatch is built for, not as an acceptance rule.
        </p>
      </AffiliateSection>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" className="h-11 px-5 text-[15px]" render={<Link href="/affiliates/commission" />}>
          Commission structure <ArrowRight className="size-4" />
        </Button>
        <Button size="lg" variant="outline" className="h-11 px-5 text-[15px]" render={<Link href="/affiliates/signup" />}>
          How to sign up
        </Button>
        <Button size="lg" variant="outline" className="h-11 px-5 text-[15px]" render={<Link href="/affiliates/promote" />}>
          Promotion tips
        </Button>
      </div>

      <AffiliateQuestions />
    </AffiliatePage>
  );
}
