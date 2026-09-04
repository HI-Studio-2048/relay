export type TriggerType = "start" | "keyword" | "command";

export type CaptureField = "name" | "email" | "phone" | `custom:${string}`;

export type FlowButton = {
  text: string;
  next: string;
};

export type FlowStep =
  | {
      id: string;
      type: "text";
      text: string;
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
