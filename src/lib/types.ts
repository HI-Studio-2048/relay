import type { SocialTriggerConfig } from "@/lib/social-triggers";

export type TriggerType =
  | "start"
  | "keyword"
  | "keyword_contains"
  | "keyword_word"
  | "keyword_starts_with"
  | "keyword_not_contains"
  | "command"
  | "start_param"
  | "comment"
  | "story_reply"
  | "story_mention"
  | "default";

export const TRIGGER_OPTIONS: { value: TriggerType; label: string }[] = [
  { value: "start", label: "Welcome (/start, once)" },
  { value: "start_param", label: "Growth link" },
  { value: "command", label: "Command" },
  { value: "keyword", label: "Message is" },
  { value: "keyword_contains", label: "Message contains" },
  { value: "keyword_word", label: "Message contains a whole word" },
  { value: "keyword_starts_with", label: "Message begins with" },
  { value: "keyword_not_contains", label: "Message doesn't contain" },
  { value: "comment", label: "Comments on a post (comment → DM)" },
  { value: "story_reply", label: "Replies to your story" },
  { value: "story_mention", label: "Mentions you in a story" },
  { value: "default", label: "Default reply" },
];

export type HttpMethod = "GET" | "POST";

export type FlowEffect =
  | { type: "http"; url: string; method: HttpMethod; body?: string }
  | { type: "notify"; text: string }
  /** Show Telegram's "typing…" indicator while a Send Message typing delay runs. */
  | { type: "typing" }
  /** AI Step: generate the next reply with Claude (async, outside the pure engine). */
  | { type: "ai_turn"; flowId: string; stepId: string }
  /** Goal step reached: record a conversion (and its value) for analytics. */
  | { type: "goal"; flowId: string; stepId: string; name: string; value?: number };

export type CaptureField = "name" | "email" | "phone" | `custom:${string}`;

export type FlowButton = {
  text: string;
  next?: string;
  url?: string;
};

/** ManyChat-style quick reply: shown as a Telegram reply keyboard under the input; tapping sends the text. */
export type FlowQuickReply = {
  text: string;
  next?: string;
};

export type TagAction = "add" | "remove";

export type SubscribeAction = "subscribe" | "unsubscribe";

export type ConditionCheck = "tag" | "field" | "subscription";

export type ConditionOp = "eq" | "contains" | "set";

export type FormField = {
  field: CaptureField;
  prompt: string;
};

/** Telegram send method per attachment. Stored on text steps; the engine ignores unknown extra fields on older flows. */
export type FlowMediaKind = "photo" | "animation" | "video" | "audio" | "document";

export type FlowMedia = {
  url: string;
  kind: FlowMediaKind;
  mime?: string;
  filename?: string;
  id?: string;
};

export type FlowCanvasPosition = {
  x: number;
  y: number;
};

/** Optional editor layout. The Telegram engine ignores this field. */
export type FlowCanvasLayout = {
  nodes: Record<string, FlowCanvasPosition>;
};

export type FlowStep =
  | {
      id: string;
      type: "text";
      text: string;
      media?: FlowMedia;
      buttons?: FlowButton[];
      quickReplies?: FlowQuickReply[];
      /** Send Message node this block belongs to when one node compiles to several steps. Engine ignores it. */
      group?: string;
      next?: string;
    }
  | {
      id: string;
      type: "capture";
      field: CaptureField;
      prompt: string;
      /** ManyChat "Skip" button: the contact can move on without answering. */
      skippable?: boolean;
      next: string;
    }
  | {
      id: string;
      type: "tag";
      tagName: string;
      action?: TagAction;
      next: string;
    }
  | {
      id: string;
      type: "set_field";
      field: CaptureField;
      value: string;
      next: string;
    }
  | {
      id: string;
      type: "delay";
      seconds: number;
      unit?: "seconds" | "minutes" | "hours" | "days";
      sendAfter?: string;
      sendBefore?: string;
      /** See the text step. A typing delay inside a Send Message node. */
      group?: string;
      next: string;
    }
  | {
      id: string;
      type: "randomizer";
      paths: { id: string; percent: number; next?: string }[];
      sticky?: boolean;
    }
  | {
      id: string;
      type: "condition";
      check: ConditionCheck;
      tagName?: string;
      field?: CaptureField;
      op?: ConditionOp;
      value?: string;
      nextTrue: string;
      nextFalse: string;
    }
  | {
      id: string;
      type: "form";
      intro?: string;
      fields: FormField[];
      next: string;
    }
  | {
      id: string;
      type: "subscribe";
      listName: string;
      action: SubscribeAction;
      next: string;
    }
  | {
      id: string;
      type: "start_flow";
      flowId: string;
      next?: string;
    }
  | {
      id: string;
      type: "http";
      url: string;
      method?: HttpMethod;
      body?: string;
      next: string;
    }
  | {
      id: string;
      type: "notify";
      text: string;
      next: string;
    }
  | {
      id: string;
      /** ManyChat AI Step: Claude holds the conversation until the goal is met or it hands off. */
      type: "ai";
      goal: string;
      /** Field keys to pick up along the way: name, email, phone, or custom keys. */
      collect?: string[];
      /** Where the flow continues once the goal is complete. */
      next?: string;
    }
  | {
      id: string;
      /** Conversion goal: counts when a contact reaches it. Optional value (revenue) for ROI. */
      type: "goal";
      name: string;
      value?: number;
      next?: string;
    }
  | {
      id: string;
      type: "end";
      text?: string;
    };

export type FlowDefinition = {
  startStepId: string;
  steps: FlowStep[];
  canvas?: FlowCanvasLayout;
  /** Comment / story trigger settings (post filter, public replies). See social-triggers.ts. */
  trigger?: SocialTriggerConfig;
};

export type FlowEditorRecord = {
  id: string;
  botId?: string;
  name: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
  priority?: number;
  definition: FlowDefinition;
};

export type ContactRecord = {
  id: string;
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  customFields: Record<string, string>;
  tags: string[];
  subscriptions?: string[];
  unsubscribed?: boolean;
  welcomed?: boolean;
  notes?: string;
  inboxStatus?: "open" | "closed";
  /** Hub routing (Zernio). See contacts.platform / channel_account_id / thread_id. */
  platform?: string | null;
  channelAccountId?: string | null;
  threadId?: string | null;
  avatarUrl?: string | null;
  /** Read-only here: set by Live Chat takeover, see store.pauseContactAutomation. */
  botPausedUntil?: string | null;
};

export type FlowSessionState = {
  id: string;
  contactId: string;
  flowId: string;
  stepId: string;
  awaitingInput: boolean;
  status: "active" | "completed" | "paused";
  formIndex?: number;
  resumeAt?: string | null;
};

export type InboundEvent = {
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  text?: string | null;
  callbackData?: string | null;
  /** Phone number from a shared Telegram contact card (reply-keyboard request_contact). */
  contactPhone?: string | null;
  telegramMessageId?: string | null;
  /** Comment and story events take the social trigger path instead of keyword matching. */
  kind?: "message" | "comment" | "story_reply" | "story_mention";
  postId?: string | null;
  platformPostId?: string | null;
  permalink?: string | null;
  isReply?: boolean;
};

export type OutboundReply = {
  text: string;
  media?: FlowMedia;
  buttons?: { text: string; data?: string; url?: string }[];
  /** Quick replies rendered as a one-time Telegram reply keyboard. Ignored when inline buttons are present. */
  keyboard?: string[];
  /** Clear a previously shown quick-reply keyboard. */
  removeKeyboard?: boolean;
  /** Add a Telegram "share my phone number" button to the reply keyboard. */
  requestContact?: boolean;
  source: "flow" | "agent" | "broadcast";
  /** Analytics: which flow step produced this message. */
  flowId?: string;
  stepId?: string;
  /** Meta: a human agent reply sent after the 24-hour window (allowed for 7 days). */
  humanAgent?: boolean;
};

export type BroadcastStatus =
  | "draft"
  | "awaiting_confirm"
  | "scheduled"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";
