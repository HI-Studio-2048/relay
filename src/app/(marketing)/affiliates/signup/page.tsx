import Link from "next/link";
import { AffiliatePage, AffiliateQuestions, AffiliateSection, TermList, UnpublishedNotice } from "@/components/marketing/affiliate-page";
import { Button } from "@/components/ui/button";
import { affiliateMetadata, affiliateTerm, affiliateTerms } from "@/lib/affiliates";

/** Reads PUBLIC_CONTACT_EMAIL per request, so changing it on the host needs no rebuild. */
export const dynamic = "force-dynamic";

export const metadata = affiliateMetadata({
  title: "Sign up for the Recatch affiliate program",
  description:
    "How to join the Recatch affiliate program. The signup URL, approval rule, eligibility, and affiliate agreement are marked TBD.",
  path: "/affiliates/signup",
});

export default function AffiliateSignupPage() {
  const signupUrl = affiliateTerm("signupUrl").value;

  return (
    <AffiliatePage
      current="/affiliates/signup"
      eyebrow="Sign up"
      title="How to sign up"
      lede={
        <p>
          There is no affiliate application URL yet. When Recatch publishes one, it will replace the Signup URL line
          below and the button on this page will open it. Until then, nothing you click enrolls you.
        </p>
      }
    >
      <UnpublishedNotice />

      <AffiliateSection title="Join">
        {signupUrl ? (
          <Button size="lg" className="h-11 px-5 text-[15px]" render={<a href={signupUrl} />}>
            Apply to the affiliate program
          </Button>
        ) : (
          <p className="rounded-2xl bg-[#fff7ed] px-5 py-4 text-[15px] font-semibold text-[#b54708] ring-1 ring-[#fdba74]">
            Signup URL: TBD
          </p>
        )}
        <p>
          A Recatch account at{" "}
          <Link href="/signup" className="text-[#0084ff] hover:underline">
            /signup
          </Link>{" "}
          is the product. Use it to learn the flows, inbox, and growth links you will later show other people. It does
          not submit an affiliate application, and it does not create a referral link.
        </p>
      </AffiliateSection>

      <AffiliateSection title="What is still open">
        <TermList terms={affiliateTerms("signup")} />
      </AffiliateSection>

      <AffiliateSection title="What to have ready">
        <p>These are practical, not acceptance criteria. Who can join is still TBD.</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>A Recatch account you have actually clicked through, so your demos match the product.</li>
          <li>One channel you can show: a Telegram bot, an Instagram account, or a WhatsApp number.</li>
          <li>
            A short note on who you reach (a Telegram channel, an Instagram audience, a client list, a newsletter) for
            when an application form exists.
          </li>
          <li>
            The affiliate agreement, once it exists. It is TBD, and these pages do not stand in for it.
          </li>
        </ul>
        <p>
          Approval is TBD, so do not assume applications are accepted automatically or that Recatch reviews them by
          hand. Both are unset.
        </p>
      </AffiliateSection>

      <AffiliateQuestions />
    </AffiliatePage>
  );
}
