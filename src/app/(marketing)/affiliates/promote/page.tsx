import Link from "next/link";
import { AffiliatePage, AffiliateQuestions, AffiliateSection, UnpublishedNotice } from "@/components/marketing/affiliate-page";
import { FLOW_TEMPLATES } from "@/lib/flow-templates";
import { affiliateMetadata, affiliateTermText, affiliateTerm } from "@/lib/affiliates";

/** Reads PUBLIC_CONTACT_EMAIL per request, so changing it on the host needs no rebuild. */
export const dynamic = "force-dynamic";

export const metadata = affiliateMetadata({
  title: "How to promote Recatch as an affiliate",
  description:
    "Promotion ideas for Recatch affiliates: flow templates, demo videos, QR codes and growth links, plus content for Telegram, Instagram, and WhatsApp marketers.",
  path: "/affiliates/promote",
});

const CATEGORY_ORDER = ["Instagram growth", "Lead capture", "AI", "Sales"] as const;

const CHANNEL_IDEAS: { channel: string; color: string; ideas: string[] }[] = [
  {
    channel: "Telegram",
    color: "#229ED9",
    ideas: [
      "Show the path from BotFather to a connected bot, then the welcome flow that asks for name, email, phone, and company and tags the person as a lead.",
      "Create a growth link, copy the short URL, and show the QR next to it. Explain that a /start from that link can tag the contact and open a chosen flow.",
      "Record a keyword or command that routes into a flow, then jump into the shared inbox and reply by hand so people see automation and a human in the same thread.",
    ],
  },
  {
    channel: "Instagram",
    color: "#E1306C",
    ideas: [
      "Install Comment → DM lead magnet. Someone comments a keyword, gets a public reply, and a DM that collects an email. That is the story most Instagram accounts want.",
      "Pair it with Follow to unlock or Giveaway entry when the audience already runs those posts. Story reply conversation and Story mention thank-you cover stories, not just the feed.",
      "Say plainly that comment-to-DM also runs on Facebook. A public reply can be picked from a list or written by AI, once per person per post, with an optional hide-after-reply.",
    ],
  },
  {
    channel: "WhatsApp",
    color: "#25D366",
    ideas: [
      "Start from Welcome + main menu or Appointment booking. WhatsApp marketers care about a first message that routes pricing, a quote, or a human.",
      "Show a growth link that opens wa.me with the start text filled in, and the same short URL’s QR on a story or a flyer.",
      "When you mention broadcasts, include the confirm step and the 24-hour reply window. Recatch’s terms require messaging only people who opted in, on every channel.",
    ],
  },
];

export default function AffiliatePromotePage() {
  const categories = [...new Set(FLOW_TEMPLATES.map((template) => template.category))].sort((a, b) => {
    const rank = (category: string) => {
      const index = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
      return index === -1 ? CATEGORY_ORDER.length : index;
    };
    return rank(a) - rank(b);
  });
  const grouped = categories.map((category) => ({
    category,
    templates: FLOW_TEMPLATES.filter((template) => template.category === category),
  }));

  return (
    <AffiliatePage
      current="/affiliates/promote"
      eyebrow="Promote"
      title="Show the product. Then point at your link."
      lede={
        <p>
          The useful promotions are walkthroughs of flows, templates, and growth links. Your affiliate link is separate
          from those, and it is not available yet: {affiliateTermText(affiliateTerm("signupUrl"))}. Put that link in
          the bio, the caption, or the video description once it exists. Do not invent one.
        </p>
      }
    >
      <UnpublishedNotice />

      <AffiliateSection eyebrow="Templates" title="Share a flow, not a screenshot of the pricing page">
        <p>
          Recatch ships starter templates under Flows. Each one installs as an inactive flow, so nothing sends until
          it is reviewed. You can export a flow as JSON and import it into another account, which is the practical way
          to hand a setup to a client or a viewer. There is no public template store and no affiliate-only template
          pack.
        </p>
        <p>
          A useful post installs one template, opens Test (the in-browser simulator), then turns the flow on. Name the
          template you used. The gallery today:
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          {grouped.map((group) => (
            <section key={group.category} className="rounded-2xl bg-white p-5 ring-1 ring-[#e5e7eb]">
              <h3 className="text-[13px] font-semibold tracking-[0.12em] text-[#0084ff] uppercase">{group.category}</h3>
              <ul className="mt-3 space-y-3">
                {group.templates.map((template) => (
                  <li key={template.id}>
                    <p className="font-medium text-[#1b1f24]">{template.name}</p>
                    <p className="text-[14px] leading-relaxed text-[#6b7280]">{template.description}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </AffiliateSection>

      <AffiliateSection eyebrow="Demo videos" title="Three recordings that match the product">
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Comment to DM",
              body: "Install Comment → DM lead magnet, run it in Test, and show the public reply plus the private DM. Mention that the flow stays off until you switch it on.",
            },
            {
              title: "Link and QR",
              body: "Open Growth links, copy the short URL (it looks like recatch.app/go/…), and show the QR Recatch generates for that link. Count a click, then a start.",
            },
            {
              title: "A human in the inbox",
              body: "Let the flow capture a lead, then open Live Chat, pause automation, and reply yourself. Teams buy Recatch for that handoff, not only for the bot.",
            },
          ].map((item, index) => (
            <li key={item.title} className="rounded-2xl bg-white p-5 ring-1 ring-[#e5e7eb]">
              <p className="font-heading text-[13px] font-semibold text-[#c9d1da] tabular-nums">0{index + 1}</p>
              <h3 className="mt-2 text-[16px] font-semibold text-[#1b1f24]">{item.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">{item.body}</p>
            </li>
          ))}
        </ol>
        <p>
          Recatch does not publish a demo-video library. Record your own screen. Keep the affiliate link, once you
          have one, in the description. The growth link inside the demo belongs to the account you are showing. It
          attributes that account’s contacts. It does not attribute Recatch signups to you.
        </p>
      </AffiliateSection>

      <AffiliateSection eyebrow="QR codes and links" title="Two different links">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-[#e5e7eb]">
            <h3 className="text-[16px] font-semibold text-[#1b1f24]">Your affiliate link</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
              This is the link that would credit a Recatch signup to you. {affiliateTermText(affiliateTerm("signupUrl"))}.{" "}
              {affiliateTermText(affiliateTerm("cookieWindow"))}. Until both are filled in, do not put a homemade
              ?ref= on recatch.app and expect it to count.
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 ring-1 ring-[#e5e7eb]">
            <h3 className="text-[16px] font-semibold text-[#1b1f24]">A customer’s growth link</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#6b7280]">
              Growth links are a product feature. The short URL is /go/&lt;slug&gt;, Recatch draws the QR itself, and
              the same link can open Telegram, Instagram (ig.me), Messenger (m.me), or WhatsApp (wa.me). A website
              chat widget snippet is on the same card. Clicks and starts are counted. Tags and a linked flow are
              optional.
            </p>
          </div>
        </div>
        <p>
          Good places for the QR, once you are demonstrating a real bot: a story sticker, the last frame of a video,
          a talk slide, or a flyer. Add ?via=instagram on the short URL when you want to skip the network picker and
          open Instagram directly.
        </p>
      </AffiliateSection>

      <AffiliateSection eyebrow="Content ideas" title="Posts for the three audiences who ask">
        <div className="grid gap-4 lg:grid-cols-3">
          {CHANNEL_IDEAS.map((item) => (
            <section key={item.channel} className="rounded-2xl bg-white p-5 ring-1 ring-[#e5e7eb]">
              <h3 className="flex items-center gap-2 text-[16px] font-semibold text-[#1b1f24]">
                <span className="inline-block size-2.5 rounded-full" style={{ background: item.color }} />
                {item.channel}
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-[#6b7280]">
                {item.ideas.map((idea) => (
                  <li key={idea}>{idea}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p>
          Other angles that match the product: an AI concierge that answers from a knowledge base imported from a
          website, Sell in the DMs (Stripe) for a payment link inside the chat, and the All accounts page if you sell
          to agencies. Slack, Discord, and Bluesky are live connections too, if that is the audience you already have.
        </p>
        <p>
          Follow the{" "}
          <Link href="/terms" className="text-[#0084ff] hover:underline">
            terms
          </Link>{" "}
          in anything you demonstrate: no spam, only people who asked to hear from the business, and each platform’s
          own messaging rules. Recatch can suspend accounts that ignore that.
        </p>
      </AffiliateSection>

      <AffiliateQuestions />
    </AffiliatePage>
  );
}
