import type { FlowDefinition } from "@/lib/types";

export const EXAMPLE_LEAD_CAPTURE_FLOW: FlowDefinition = {
  startStepId: "welcome",
  steps: [
    {
      id: "welcome",
      type: "text",
      text: "Hey — this is HI Studio. Want to leave your details so we can follow up?",
      buttons: [
        { text: "Yes, let's go", next: "intro_media" },
        { text: "Not now", next: "later" },
      ],
    },
    {
      id: "intro_media",
      type: "text",
      text: "Great — I'll ask a few details.",
      media: {
        url: "https://upload.wikimedia.org/wikipedia/commons/d/d3/Newtons_cradle_animation_book_2.gif",
        kind: "animation",
        filename: "intro.gif",
      },
      next: "ask_name",
    },
    {
      id: "ask_name",
      type: "capture",
      field: "name",
      prompt: "What's your name?",
      next: "ask_email",
    },
    {
      id: "ask_email",
      type: "capture",
      field: "email",
      prompt: "What's the best email?",
      next: "ask_phone",
    },
    {
      id: "ask_phone",
      type: "capture",
      field: "phone",
      prompt: "And a phone number?",
      next: "ask_company",
    },
    {
      id: "ask_company",
      type: "capture",
      field: "custom:company",
      prompt: "What company are you with?",
      next: "tag_lead",
    },
    {
      id: "tag_lead",
      type: "tag",
      tagName: "lead",
      next: "thanks",
    },
    {
      id: "thanks",
      type: "end",
      text: "Thanks — you're on our list. We'll be in touch.",
    },
    {
      id: "later",
      type: "end",
      text: "No problem. Send /start whenever you're ready.",
    },
  ],
};
