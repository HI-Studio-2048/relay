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
    description: "Comment WIN to enter. Recatch confirms the entry by DM, tags the entrant, and pings your team.",
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
    id: "follow-gate",
    name: "Follow to unlock",
    description: "Comment UNLOCK: followers get the reward right away; everyone else is asked to follow first, then tap to re-check.",
    category: "Instagram growth",
    channels: ["instagram"],
    triggerType: "comment",
    triggerValue: "unlock",
    definition: {
      startStepId: "open",
      trigger: { publicReplies: ["Check your DMs 🔓", "Sent! 📩"], oncePerContact: true },
      steps: [
        { id: "open", type: "text", text: "Hey {{first_name|there}}! Tap below to unlock it 👇", buttons: [{ text: "Unlock", next: "check" }] },
        {
          id: "check",
          type: "condition",
          check: "field",
          field: "custom:follows_you",
          op: "eq",
          value: "yes",
          nextTrue: "reward",
          nextFalse: "ask",
        },
        { id: "ask", type: "text", text: "Almost there! Follow us first, then tap the button 💛", buttons: [{ text: "I followed", next: "check" }] },
        { id: "reward", type: "tag", tagName: "follower-unlocked", action: "add", next: "send" },
        { id: "send", type: "end", text: "Unlocked 🎉 Here it is: https://example.com/reward" },
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
    id: "product-gallery",
    name: "Product showcase gallery",
    description: "DM SHOP to get a swipeable gallery of products. Each card has a buy link and a button that tags the interest.",
    category: "Sales",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "shop, products, catalog",
    definition: {
      startStepId: "gallery",
      steps: [
        {
          id: "gallery",
          type: "gallery",
          text: "Here's what's new, {{first_name|friend}} 👇",
          cards: [
            {
              title: "The Classic Tee",
              subtitle: "$29 · organic cotton, 6 colors",
              url: "https://example.com/tee",
              buttons: [{ text: "Buy now", url: "https://example.com/tee" }, { text: "I like this one", next: "tee" }],
            },
            {
              title: "Everyday Hoodie",
              subtitle: "$59 · brushed fleece",
              url: "https://example.com/hoodie",
              buttons: [{ text: "Buy now", url: "https://example.com/hoodie" }, { text: "I like this one", next: "hoodie" }],
            },
            {
              title: "Cap",
              subtitle: "$19 · one size",
              url: "https://example.com/cap",
              buttons: [{ text: "Buy now", url: "https://example.com/cap" }, { text: "I like this one", next: "cap" }],
            },
          ],
        },
        { id: "tee", type: "tag", tagName: "likes-tee", action: "add", next: "thanks" },
        { id: "hoodie", type: "tag", tagName: "likes-hoodie", action: "add", next: "thanks" },
        { id: "cap", type: "tag", tagName: "likes-cap", action: "add", next: "thanks" },
        { id: "thanks", type: "end", text: "Great pick! Use code WELCOME10 for 10% off 🎁" },
      ],
    },
  },
  {
    id: "lead-score-quiz",
    name: "Lead-scoring quiz",
    description: "Three quick-tap questions add up a score. Hot leads (score above 5) get a booking link and a team alert; the rest get a free resource.",
    category: "Lead capture",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "quiz, fit, right for me",
    definition: {
      startStepId: "reset",
      steps: [
        { id: "reset", type: "set_field", field: "custom:score", value: "0", next: "q1" },
        {
          id: "q1",
          type: "text",
          text: "Quick quiz, {{first_name|friend}} — how big is your team?",
          quickReplies: [
            { text: "Just me", next: "q2" },
            { text: "2–10", next: "q1_mid" },
            { text: "10+", next: "q1_big" },
          ],
        },
        { id: "q1_mid", type: "set_field", field: "custom:score", value: "2", mode: "add", next: "q2" },
        { id: "q1_big", type: "set_field", field: "custom:score", value: "4", mode: "add", next: "q2" },
        {
          id: "q2",
          type: "text",
          text: "When do you want to start?",
          quickReplies: [
            { text: "This week", next: "q2_now" },
            { text: "This month", next: "q2_soon" },
            { text: "Just looking", next: "q3" },
          ],
        },
        { id: "q2_now", type: "set_field", field: "custom:score", value: "3", mode: "add", next: "q3" },
        { id: "q2_soon", type: "set_field", field: "custom:score", value: "1", mode: "add", next: "q3" },
        { id: "q3", type: "capture", field: "email", prompt: "Last one: what's your email?", skippable: true, next: "check" },
        {
          id: "check",
          type: "condition",
          check: "field",
          field: "custom:score",
          op: "gt",
          value: "5",
          extra: [{ check: "field", field: "email", op: "set" }],
          match: "all",
          nextTrue: "hot",
          nextFalse: "cold",
        },
        { id: "hot", type: "tag", tagName: "hot-lead", action: "add", next: "hot_alert" },
        { id: "hot_alert", type: "notify", text: "🔥 Hot lead: {{name}} · score {{field:score}} · {{email}}", next: "hot_msg" },
        { id: "hot_msg", type: "text", text: "You're a great fit! Grab a time with us:", buttons: [{ text: "Book a call", url: "https://cal.com/example" }] },
        { id: "cold", type: "end", text: "Thanks! Here's a free starter guide while you explore: https://example.com/guide" },
      ],
    },
  },
  {
    id: "ai-intent-router",
    name: "AI support router",
    description: "No keywords needed: Claude spots people asking about an order, in any wording or language, and this flow collects the order number for your team.",
    category: "AI",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "intent",
    triggerValue: "Asking where their order is, about shipping, tracking or a delivery problem",
    definition: {
      startStepId: "ask",
      steps: [
        { id: "ask", type: "capture", field: "custom:order_number", prompt: "Sorry for the wait! What's your order number? 📦", next: "tag" },
        { id: "tag", type: "tag", tagName: "order-question", action: "add", next: "notify" },
        { id: "notify", type: "notify", text: "Order question from {{name}}: #{{field:order_number}}", next: "done" },
        { id: "done", type: "end", text: "Thanks! A teammate is checking order #{{field:order_number}} and will reply here shortly." },
      ],
    },
  },
  {
    id: "appointment-booking",
    name: "Appointment booking",
    description: "DM BOOK: pick a service from a gallery, leave a phone number, get the booking link, and a reminder nudge the next day if they haven't booked.",
    category: "Sales",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "book, appointment, schedule",
    definition: {
      startStepId: "services",
      steps: [
        {
          id: "services",
          type: "gallery",
          text: "Which service would you like to book? 👇",
          cards: [
            { title: "Consultation", subtitle: "30 min · free", buttons: [{ text: "Book this", next: "pick_consult" }] },
            { title: "Full session", subtitle: "90 min · $120", buttons: [{ text: "Book this", next: "pick_full" }] },
          ],
        },
        { id: "pick_consult", type: "set_field", field: "custom:service", value: "Consultation", next: "phone" },
        { id: "pick_full", type: "set_field", field: "custom:service", value: "Full session", next: "phone" },
        { id: "phone", type: "capture", field: "phone", prompt: "Great choice! What's the best phone number for reminders?", skippable: true, next: "link" },
        { id: "link", type: "text", text: "Here's the calendar for your {{field:service}}:", buttons: [{ text: "Pick a time", url: "https://cal.com/example" }], next: "wait" },
        { id: "wait", type: "delay", seconds: 86400, unit: "days", next: "booked" },
        { id: "booked", type: "condition", check: "tag", tagName: "booked", nextTrue: "done", nextFalse: "nudge" },
        { id: "nudge", type: "text", text: "Hi {{first_name|there}}! Still want that {{field:service}}? Slots go fast 🗓️", buttons: [{ text: "Pick a time", url: "https://cal.com/example" }], next: "done" },
        { id: "done", type: "end" },
      ],
    },
  },
  {
    id: "stripe-checkout",
    name: "Sell in the DMs (Stripe)",
    description: "DM BUY to get the offer and a Stripe Payment Link. Paid checkouts come back as a Purchase goal with revenue, credited to this flow.",
    category: "Sales",
    channels: ["instagram", "facebook", "whatsapp", "telegram"],
    triggerType: "keyword_contains",
    triggerValue: "buy, order, checkout",
    definition: {
      startStepId: "offer",
      steps: [
        {
          id: "offer",
          type: "text",
          text: "Great choice {{first_name|friend}}! The Starter Kit is $49 and ships in 2 days 📦",
          buttons: [
            { text: "Pay securely", url: "https://buy.stripe.com/test_your_link?client_reference_id={{contact_id}}" },
            { text: "I have a question", next: "question" },
          ],
        },
        { id: "question", type: "tag", tagName: "checkout-question", action: "add", next: "handoff" },
        { id: "handoff", type: "notify", text: "{{name}} has a question before buying", next: "reply" },
        { id: "reply", type: "end", text: "No problem — a teammate will answer here in a moment." },
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
