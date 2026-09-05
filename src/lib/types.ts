export type TriggerType = "start" | "keyword" | "command";

export type CaptureField = "name" | "email" | "phone" | `custom:${string}`;

export type FlowButton = {
  text: string;
  next: string;
};

/** Telegram sendPhoto vs sendAnimation. Stored on text steps; the engine ignores unknown extra fields on older flows. */
export type FlowMediaKind = "photo" | "animation";

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
      next?: string;
    }
  | {
      id: string;
      type: "capture";
      field: CaptureField;
      prompt: string;
      next: string;
    }
  | {
      id: string;
      type: "tag";
      tagName: string;
      next: string;
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
};

export type FlowEditorRecord = {
  id: string;
  botId?: string;
  name: string;
  triggerType: TriggerType;
  triggerValue: string | null;
  isActive: boolean;
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
};

export type FlowSessionState = {
  id: string;
  contactId: string;
  flowId: string;
  stepId: string;
  awaitingInput: boolean;
  status: "active" | "completed";
};

export type InboundEvent = {
  telegramUserId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  languageCode?: string | null;
  text?: string | null;
  callbackData?: string | null;
  telegramMessageId?: string | null;
};

export type OutboundReply = {
  text: string;
  media?: FlowMedia;
  buttons?: { text: string; data: string }[];
  source: "flow" | "agent" | "broadcast";
};

export type BroadcastStatus =
  | "draft"
  | "awaiting_confirm"
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "cancelled";
