import Link from "next/link";
import { AffiliatePage, AffiliateQuestions, AffiliateSection, TermList, UnpublishedNotice } from "@/components/marketing/affiliate-page";
import { affiliateMetadata, affiliateTerms } from "@/lib/affiliates";

/** Reads PUBLIC_CONTACT_EMAIL per request, so changing it on the host needs no rebuild. */
export const dynamic = "force-dynamic";

export const metadata = affiliateMetadata({
  title: "Recatch affiliate commission",
  description:
    "Recatch affiliate commission, cookie window, and payout terms. Each one is marked TBD until Recatch publishes it.",
  path: "/affiliates/commission",
});

export default function AffiliateCommissionPage() {
  return (
    <AffiliatePage
      current="/affiliates/commission"
      eyebrow="Commission"
      title="Commission structure"
      lede={
        <p>
          This is the full list of money terms. Recatch has not chosen a rate, a cookie window, or a payout rule, so
          every line is still TBD. Do not quote a percentage until the TBD on that line is replaced.
        </p>
      }
    >
      <UnpublishedNotice />

      <AffiliateSection title="The terms, as published today">
        <TermList terms={affiliateTerms("commission")} />
        <p className="text-[14px] text-[#6b7280]">
          Paid plans are mentioned in the{" "}
          <Link href="/terms" className="text-[#0084ff] hover:underline">
            terms of service
          </Link>
          : the price and billing period are shown when a customer signs up, and fees already paid are not refunded
          unless the law says otherwise. That customer policy is not an affiliate clawback rule. Refunds and clawbacks
          for affiliates stay TBD above.
        </p>
      </AffiliateSection>

      <AffiliateSection title="How to read a TBD">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="font-semibold text-[#1b1f24]">Commission: TBD</strong> is the rate. It is not 20%, 30%,
            or any other number.
          </li>
          <li>
            <strong className="font-semibold text-[#1b1f24]">What commission is paid on: TBD</strong> covers one-time
            versus recurring, and which charges count.
          </li>
          <li>
            <strong className="font-semibold text-[#1b1f24]">Cookie window: TBD</strong> is how long a click would
            stay attached to you. Recatch does not set a cookie for affiliates today.
          </li>
          <li>
            <strong className="font-semibold text-[#1b1f24]">Payout schedule, minimum, method, and currency</strong>{" "}
            are all unset. There is no PayPal, bank, or Stripe payout to assume.
          </li>
        </ul>
        <p>
          Self-referrals are also unset. Signing up for Recatch yourself, or sending a brand you own, is not described
          as allowed or forbidden until that line is filled in.
        </p>
      </AffiliateSection>

      <AffiliateQuestions />
    </AffiliatePage>
  );
}
