import type { FlowDefinition, TriggerType } from "@/lib/types";

/**
 * Starter automations, ManyChat Templates style. Pure data, browser safe. Each one installs as an
 * inactive flow so nothing goes live until it is reviewed.
 */
export type FlowTemplate = {
  id: string;
  name: string;
  description: string;
  category: "Instagram growth" | "Lead capture" | "AI" | "Sales";
  /** Networks it is built for, for the gallery badge. */
  channels: string[];
  triggerType: TriggerType;
  triggerValue: string | null;
  definition: FlowDefinition;
};

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: "comment-lead-magnet",
    name: "Comment → DM lead magnet",
    description: "Someone comments GUIDE, gets a public reply and a DM. They tap, leave an email, and receive the link.",
    category: "Instagram growth",
    channels: ["instagram", "facebook"],
    triggerType: "comment",
    triggerValue: "guide",
    definition: {
      startStepId: "open",
      trigger: {
        publicReplies: ["Sent you a DM {{first_name}} 📩", "Check your DMs! 👀", "Just messaged you ✨"],
        oncePerContact: true,
      },
      steps: [
        { id: "open", type: "text", text: "Hey {{first_name|there}}! Here's the guide you asked for 👇", buttons: [{ text: "Send it to me", next: "ask" }] },
        { id: "ask", type: "capture", field: "email", prompt: "Where should I send it? Drop your best email.", skippable: true, next: "tag" },
        { id: "tag", type: "tag", tagName: "lead-magnet", action: "add", next: "deliver" },
        { id: "deliver", type: "end", text: "Here you go: https://example.com/guide 🎉 Reply anytime if you have questions." },
      ],
    },
  },
  {
    id: "giveaway-entry",
    name: "Giveaway entry",
    description: "Comment WIN to enter. Relay confirms the entry by DM, tags the entrant, and pings your team.",
    category: "Instagram growth",
    channels: ["instagram", "facebook"],
    triggerType: "comment",
    triggerValue: "win",
    definition: {
      startStepId: "open",
      trigger: { publicReplies: ["You're in! Check your DMs 🍀", "Entry received — DM sent 🎁"], oncePerContact: true },
      steps: [
        { id: "open", type: "text", text: "You're almost in the giveaway, {{first_name|friend}}! Tap to confirm your entry.", buttons: [{ text: "Confirm my entry", next: "tag" }] },
        { id: "tag", type: "tag", tagName: "giveaway", action: "add", next: "notify" },
        { id: "notify", type: "notify", text: "New giveaway entry: {{name}} (@{{username}})", next: "done" },
        { id: "done", type: "end", text: "Confirmed ✅ Winners are announced on Friday. Good luck!" },
      ],
    },
  },
  {
    id: "story-mention-thanks",
    name: "Story mention thank-you",
    description: "When someone mentions you in their story, thank them and send a discount code.",
    category: "Instagram growth",
    channels: ["instagram"],
    triggerType: "story_mention",
    triggerValue: null,
    definition: {
      startStepId: "thanks",
      steps: [
        { id: "thanks", type: "text", text: "Thank you for the shoutout {{first_name|friend}}! 🙌 Here's 10% off as a thank-you: THANKYOU10", next: "tag" },
        { id: "tag", type: "tag", tagName: "ambassador", action: "add", next: "done" },
        { id: "done", type: "end" },
      ],
    },
  },
  {
    id: "story-reply-starter",
    name: "Story reply conversation",
    description: "Turn story replies into conversations with quick replies that route to pricing, booking, or a human.",
    category: "Instagram growth",
    channels: ["instagram"],
    triggerType: "story_reply",
    triggerValue: null,
    definition: {
      startStepId: "hi",
      steps: [
        {
          id: "hi",
          type: "text",
          text: "Thanks for replying to our story! What are you most interested in?",
          quickReplies: [
            { text: "Pricing", next: "pricing" },
            { text: "Book a call", next: "book" },
            { text: "Just saying hi", next: "bye" },
          ],
        },
        { id: "pricing", type: "end", text: "Our plans start at $49/mo — details here: https://example.com/pricing" },
        { id: "book", type: "text", text: "Pick a time that works for you:", buttons: [{ text: "Book now", url: "https://cal.com/example" }] },
        { id: "bye", type: "end", text: "Hi back! 👋 Have a great day." },
      ],
    },
  },
  {
    id: "welcome-menu",
    name: "Welcome + main menu",
    description: "The first message every new contact gets: a greeting and a menu that routes them.",
    category: "Lead capture",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "start",
    triggerValue: "/start",
    definition: {
      startStepId: "hi",
      steps: [
        {
          id: "hi",
          type: "text",
          text: "Hey {{first_name|there}}, welcome! 👋 How can we help?",
          quickReplies: [
            { text: "See pricing", next: "pricing" },
            { text: "Get a quote", next: "quote" },
            { text: "Talk to a human", next: "human" },
          ],
        },
        { id: "pricing", type: "end", text: "Here's our pricing: https://example.com/pricing" },
        { id: "quote", type: "form", intro: "Happy to put a quote together. A few quick questions:", fields: [
          { field: "name", prompt: "What's your name?" },
          { field: "email", prompt: "Best email to send the quote to?" },
          { field: "custom:project", prompt: "In one line, what do you need?" },
        ], next: "quote_done" },
        { id: "quote_done", type: "tag", tagName: "quote-request", action: "add", next: "quote_thanks" },
        { id: "quote_thanks", type: "end", text: "Thanks {{first_name}}! We'll email your quote within one business day." },
        { id: "human", type: "notify", text: "{{name}} wants to talk to a human", next: "human_ack" },
        { id: "human_ack", type: "end", text: "Got it — a teammate will reply here shortly." },
      ],
    },
  },
  {
    id: "ai-concierge",
    name: "AI concierge",
    description: "Claude answers questions from your knowledge base and collects an email before wrapping up.",
    category: "AI",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "question, help, info",
    definition: {
      startStepId: "intro",
      steps: [
        { id: "intro", type: "text", text: "Happy to help! Ask me anything.", next: "agent" },
        { id: "agent", type: "ai", goal: "Answer their questions using the business knowledge. Once they're satisfied, get their email so the team can follow up.", collect: ["email"], next: "tag" },
        { id: "tag", type: "tag", tagName: "ai-assisted", action: "add", next: "done" },
        { id: "done", type: "end", text: "Thanks {{first_name|}}! We'll be in touch." },
      ],
    },
  },
  {
    id: "ai-qualifier",
    name: "AI lead qualifier",
    description: "Claude finds out budget, timeline and email in a natural chat, then tags hot leads and alerts your team.",
    category: "AI",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "quote, pricing, price",
    definition: {
      startStepId: "agent",
      steps: [
        { id: "agent", type: "ai", goal: "Qualify the lead: learn what they need, their budget, their timeline, and their email.", collect: ["budget", "timeline", "email"], next: "tag" },
        { id: "tag", type: "tag", tagName: "qualified", action: "add", next: "notify" },
        { id: "notify", type: "notify", text: "Qualified lead: {{name}} · budget {{budget}} · timeline {{timeline}} · {{email}}", next: "done" },
        { id: "done", type: "text", text: "Perfect — book a time with the team here:", buttons: [{ text: "Book a call", url: "https://cal.com/example" }] },
      ],
    },
  },
  {
    id: "follow-up-nudge",
    name: "Lead follow-up nudge",
    description: "Capture an email, then follow up a day later if they have not booked.",
    category: "Sales",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "demo",
    definition: {
      startStepId: "ask",
      steps: [
        { id: "ask", type: "capture", field: "email", prompt: "Love to show you around! What's your email?", next: "send" },
        { id: "send", type: "text", text: "Here's the demo link: https://example.com/demo", next: "wait" },
        { id: "wait", type: "delay", seconds: 86400, unit: "days", next: "check" },
        { id: "check", type: "condition", check: "tag", tagName: "booked", nextTrue: "done", nextFalse: "nudge" },
        { id: "nudge", type: "text", text: "Hey {{first_name|there}}, did you get a chance to look at the demo? Happy to answer anything.", next: "done" },
        { id: "done", type: "end" },
      ],
    },
  },
  {
    id: "drop-waitlist",
    name: "Product drop waitlist",
    description: "DM DROP to join the waitlist; subscribers get the broadcast when it goes live.",
    category: "Sales",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "drop, waitlist",
    definition: {
      startStepId: "sub",
      steps: [
        { id: "sub", type: "subscribe", listName: "drop-waitlist", action: "subscribe", next: "done" },
        { id: "done", type: "end", text: "You're on the list 🔔 We'll DM you the second it drops." },
      ],
    },
  },
];

export function findTemplate(id: string) {
  return FLOW_TEMPLATES.find((template) => template.id === id) ?? null;
}
