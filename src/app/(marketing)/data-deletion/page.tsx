import type { Metadata } from "next";
import { ContactEmail, LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Delete your data · Relay",
  description: "How to get your messages and profile removed from Relay.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Delete your data"
      intro={
        <p>
          If you messaged a business that uses {LEGAL.product}, or you connected your own account to Relay, here&apos;s
          how to get your data removed.
        </p>
      }
    >
      <LegalSection heading="If you messaged a business">
        <p>The quickest way is to ask the business. They can erase you from Relay right away.</p>
        <p>
          You can also email <ContactEmail /> with the subject &ldquo;Delete my data&rdquo;. Tell us:
        </p>
        <ul>
          <li>which platform you used (Instagram, Messenger, WhatsApp, Telegram and so on)</li>
          <li>your username, or your phone number for WhatsApp</li>
          <li>the name of the business you messaged, if you know it</li>
        </ul>
        <p>
          We&apos;ll check it&apos;s you, then delete your messages, profile details, tags and fields. It&apos;s done
          within 30 days, and we&apos;ll email you when it is. Reports keep an anonymous count with nothing that points
          back to you.
        </p>
      </LegalSection>

      <LegalSection heading="If you connected a Facebook, Instagram or WhatsApp account">
        <p>
          Disconnect it from the Channels page in Relay, or remove Relay in Facebook under Settings, then Business
          integrations. That stops all new data. To delete what was already stored, email us as above.
        </p>
      </LegalSection>

      <LegalSection heading="If you have a Relay account">
        <p>
          Email <ContactEmail /> from the address on your account, and we&apos;ll delete the account along with its
          connected channels, contacts and conversations. That can&apos;t be undone, so export anything you want to
          keep first. Contacts can be exported to CSV from the Contacts page.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
