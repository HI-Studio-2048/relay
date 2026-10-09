import Link from "next/link";
import type { Metadata } from "next";
import { ContactEmail, LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of service · Relay",
  description: "The rules for using Relay.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro={
        <p>
          These terms cover your use of {LEGAL.product}, run by {LEGAL.company}. By creating an account you agree to
          them. If you&apos;re signing up for a business, you agree on its behalf.
        </p>
      }
    >
      <LegalSection heading="Your account">
        <p>
          Keep your login safe. You&apos;re responsible for what happens under your account, including what your
          teammates do. Tell us straight away if you think someone else got in.
        </p>
      </LegalSection>

      <LegalSection heading="Messaging people the right way">
        <p>Relay sends messages in your name, so you&apos;re responsible for them. You agree to:</p>
        <ul>
          <li>
            Only message people who contacted you first or agreed to hear from you, and stop when they ask you to.
          </li>
          <li>
            Follow the rules of every platform you connect, including Meta&apos;s, Telegram&apos;s and WhatsApp&apos;s
            messaging policies and their 24-hour reply windows.
          </li>
          <li>Follow the laws that apply to you, including privacy and marketing laws.</li>
          <li>
            Tell the people you message how you use their data. Our{" "}
            <Link href="/privacy" className="text-[#0084ff] hover:underline">privacy policy</Link> covers what Relay
            does, but your own policy has to cover what you do.
          </li>
        </ul>
        <p>
          Don&apos;t use Relay for spam, scams, harassment, illegal content, or to get around a platform&apos;s limits
          or bans. We can suspend accounts that do.
        </p>
      </LegalSection>

      <LegalSection heading="Connected platforms">
        <p>
          Relay depends on Telegram, Meta, Zernio and other services that we don&apos;t control. If one of them changes
          its API, limits your account or goes down, parts of Relay may stop working until it&apos;s fixed. We
          aren&apos;t responsible for their decisions.
        </p>
      </LegalSection>

      <LegalSection heading="AI features">
        <p>
          AI replies, suggestions and summaries are generated automatically and can be wrong. Check them before you
          rely on them, especially for anything about money, health or legal matters. You can turn AI features off.
        </p>
      </LegalSection>

      <LegalSection heading="Your data">
        <p>
          Your flows, contacts and conversations belong to you. We only use them to run Relay for you, as set out in
          the privacy policy. You can export your contacts at any time.
        </p>
      </LegalSection>

      <LegalSection heading="Paid plans">
        <p>
          If you&apos;re on a paid plan, the price and billing period are shown when you sign up. Fees already paid
          aren&apos;t refunded unless the law says otherwise.
        </p>
      </LegalSection>

      <LegalSection heading="The service as it is">
        <p>
          We work hard to keep Relay running and your data safe, but we provide it as it is, without a promise that it
          will never fail or lose a message. As far as the law allows, our total liability to you is limited to what
          you paid us in the 12 months before the claim.
        </p>
      </LegalSection>

      <LegalSection heading="Ending things">
        <p>
          You can stop using Relay and ask us to delete your account at any time. We can suspend or close accounts
          that break these terms, and we&apos;ll tell you why unless the law stops us.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          We may update these terms. If a change matters, we&apos;ll email account owners before it takes effect.
          Questions go to <ContactEmail />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
