import Link from "next/link";
import type { Metadata } from "next";
import { ContactEmail, LegalPage, LegalSection } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal";

/** Reads PUBLIC_CONTACT_EMAIL per request, so changing it on the host needs no rebuild. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy policy · Recatch",
  description: "What Recatch collects, why, who it's shared with, and how to get it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <p>
          {LEGAL.product} is run by {LEGAL.company}. Businesses use it to answer the messages and comments they get on
          Telegram, Instagram, Messenger, WhatsApp and other networks. This page covers two groups of people: the
          businesses who sign up for Recatch, and the people who message those businesses.
        </p>
      }
    >
      <LegalSection heading="Who decides what happens to message data">
        <p>
          When you message a business that uses Recatch, that business decides how your conversation is used. Recatch
          processes it on their behalf. If you want to know what a business does with your data, or want it removed,
          ask the business first. You can also contact us directly (see the bottom of this page).
        </p>
      </LegalSection>

      <LegalSection heading="What we collect">
        <p>From businesses with a Recatch account:</p>
        <ul>
          <li>Name, email address and a password, which is stored hashed and never in plain text.</li>
          <li>
            Access tokens for the accounts they connect (a Telegram bot, an Instagram or Facebook page, a WhatsApp
            number and so on). These are encrypted before they are stored.
          </li>
          <li>The flows, messages, tags and settings they create, and a log of actions taken by their team.</li>
        </ul>
        <p>From people who message a business that uses Recatch:</p>
        <ul>
          <li>
            The public profile details the platform shares with the business, such as name, username and profile
            picture.
          </li>
          <li>The messages and comments you send to that business, and the replies you get.</li>
          <li>
            Anything you choose to give the business in the chat, like an email address, a phone number or answers to
            a question, plus tags and notes the business adds.
          </li>
          <li>Whether you clicked a link the business sent, and any purchase it can attribute to that link.</li>
        </ul>
        <p>
          We don&apos;t collect payment card details. If a business uses Stripe, payment happens on Stripe and Recatch
          only receives the amount, currency and which contact it belongs to.
        </p>
      </LegalSection>

      <LegalSection heading="How it's used">
        <ul>
          <li>To deliver messages, run the automated replies a business sets up, and show conversations in its inbox.</li>
          <li>
            To power optional AI features, such as suggested replies, summaries and AI answers from the business&apos;s
            own help content. When a business turns these on, the relevant message text is sent to our AI provider to
            produce a reply.
          </li>
          <li>To show the business reports about its own conversations.</li>
          <li>To keep the service secure, fix problems and stop abuse.</li>
        </ul>
        <p>
          We don&apos;t sell personal data, we don&apos;t use it for advertising, and we don&apos;t use it to train AI
          models.
        </p>
      </LegalSection>

      <LegalSection heading="Who it's shared with">
        <p>Only the services needed to run Recatch, and only what each one needs:</p>
        <ul>
          <li>The messaging platforms themselves (Telegram, Meta, and the others), to send and receive messages.</li>
          <li>Zernio, when a business connects its social accounts through it.</li>
          <li>Anthropic, for the AI features described above.</li>
          <li>Our hosting provider, which runs the servers and database.</li>
          <li>Stripe, Slack, Discord or Microsoft Teams, only if the business connects them.</li>
        </ul>
        <p>We may also disclose data when the law requires it.</p>
      </LegalSection>

      <LegalSection heading="Cookies">
        <p>
          Recatch sets one cookie, to keep you signed in. There are no advertising or tracking cookies. The app also
          remembers a few display preferences in your browser.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Conversation data stays until the business deletes it or closes its account. A business can erase a person
          from Recatch at any time. That removes their messages, tags and fields, and leaves only an anonymous count in
          the business&apos;s reports.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights and deleting your data">
        <p>
          You can ask for a copy of your data, ask for it to be corrected, or ask for it to be deleted. The steps are
          on the <Link href="/data-deletion" className="text-[#0084ff] hover:underline">data deletion page</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Connections use HTTPS. Account tokens are encrypted at rest and kept out of our logs. Each business can only
          see its own data.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          If this policy changes in a way that matters, we&apos;ll update the date at the top and tell account owners
          by email. Questions go to <ContactEmail />.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
