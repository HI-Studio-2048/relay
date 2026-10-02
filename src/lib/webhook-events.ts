/** Outgoing webhook events. Browser safe, shared by the API and the Integrations page. */
export const WEBHOOK_EVENTS = [
  { value: "contact.created", label: "New contact" },
  { value: "message.received", label: "Message or comment received" },
  { value: "contact.tag_added", label: "Tag added" },
  { value: "contact.tag_removed", label: "Tag removed" },
  { value: "contact.field_set", label: "Field set (incl. email / phone captured)" },
  { value: "contact.subscribed", label: "Subscribed to a list" },
  { value: "flow.completed", label: "Flow completed" },
  { value: "conversation.handoff", label: "AI handed off to a human" },
  { value: "conversation.closed", label: "Conversation marked Done in Live Chat" },
  { value: "conversation.rated", label: "Customer rated a conversation (CSAT)" },
  { value: "goal.reached", label: "Flow goal reached (conversion)" },
] as const;
