import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * A connected channel account. Historically a Telegram bot; `channel` now selects the adapter.
 * `telegramUsername` doubles as the account handle (page name, IG username, WhatsApp display number)
 * and `tokenEncrypted` holds the Meta access token for non-Telegram channels.
 */
export const bots = pgTable("bots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  channel: text("channel").notNull().default("telegram"),
  telegramUsername: text("telegram_username"),
  telegramBotId: text("telegram_bot_id"),
  /** Page id, Instagram account id, or WhatsApp phone number id. */
  externalAccountId: text("external_account_id"),
  tokenEncrypted: text("token_encrypted").notNull(),
  /** Meta app secret for webhook signature checks. */
  appSecretEncrypted: text("app_secret_encrypted"),
  webhookSecret: text("webhook_secret").notNull(),
  webhookUrl: text("webhook_url"),
  status: text("status").notNull().default("disconnected"),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  lastHealthError: text("last_health_error"),
  /** Per-account settings (provider webhook id, AI persona, ice breakers…). */
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    telegramUserId: text("telegram_user_id").notNull(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    languageCode: text("language_code"),
    email: text("email"),
    phone: text("phone"),
    unsubscribed: boolean("unsubscribed").notNull().default(false),
    subscriptions: jsonb("subscriptions").$type<string[]>().notNull().default([]),
    welcomed: boolean("welcomed").notNull().default(false),
    notes: text("notes").notNull().default(""),
    inboxStatus: text("inbox_status").notNull().default("open"),
    /** Live Chat snooze: hidden from Open until this time or their next message. */
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    /** Hub channels (Zernio): the network, the hub account, and the conversation to reply into. */
    platform: text("platform"),
    channelAccountId: text("channel_account_id"),
    threadId: text("thread_id"),
    avatarUrl: text("avatar_url"),
    /** Live Chat takeover: automation stays quiet for this person until then (or until resumed). */
    botPausedUntil: timestamp("bot_paused_until", { withTimezone: true }),
    /** Live Chat assignee (team_members.id). */
    assignedTo: text("assigned_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("contacts_bot_tg_idx").on(table.botId, table.telegramUserId)],
);

export const tags = pgTable(
  "tags",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#c4a574"),
  },
  (table) => [uniqueIndex("tags_bot_name_idx").on(table.botId, table.name)],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.tagId] })],
);

export const customFields = pgTable(
  "custom_fields",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type").notNull().default("text"),
  },
  (table) => [uniqueIndex("custom_fields_bot_key_idx").on(table.botId, table.key)],
);

export const contactFieldValues = pgTable(
  "contact_field_values",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.fieldId] })],
);

export const flows = pgTable("flows", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerValue: text("trigger_value"),
  isActive: boolean("is_active").notNull().default(true),
  priority: integer("priority").notNull().default(0),
  /** Folder name on the Flows board; null = unfiled. */
  folder: text("folder"),
  definition: jsonb("definition").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Snapshot of a flow before each save, for restore. */
export const flowVersions = pgTable("flow_versions", {
  id: text("id").primaryKey(),
  flowId: text("flow_id")
    .notNull()
    .references(() => flows.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerValue: text("trigger_value"),
  definition: jsonb("definition").notNull(),
  author: text("author"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const flowSessions = pgTable("flow_sessions", {
  id: text("id").primaryKey(),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  flowId: text("flow_id")
    .notNull()
    .references(() => flows.id, { onDelete: "cascade" }),
  stepId: text("step_id").notNull(),
  awaitingInput: boolean("awaiting_input").notNull().default(false),
  status: text("status").notNull().default("active"),
  resumeAt: timestamp("resume_at", { withTimezone: true }),
  formIndex: integer("form_index"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(),
  source: text("source").notNull(),
  body: text("body").notNull(),
  telegramMessageId: text("telegram_message_id"),
  /** Team member who wrote an agent reply. */
  author: text("author"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const broadcasts = pgTable("broadcasts", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  body: text("body").notNull(),
  /** A/B test: half the audience gets this text instead. */
  bodyB: text("body_b"),
  /** Null means "everyone" (all subscribed contacts of the bot). */
  tagId: text("tag_id").references(() => tags.id, { onDelete: "restrict" }),
  /** Extra audience conditions (segments.ts). Applied on top of tagId. */
  segment: jsonb("segment").$type<Record<string, unknown>>(),
  /** Send this flow to each recipient instead of the text body. */
  flowId: text("flow_id").references(() => flows.id, { onDelete: "set null" }),
  /** Confirmed broadcasts wait in "scheduled" until this time. */
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  /** Deliver to each person at their usual active hour within 24h. */
  smartTiming: boolean("smart_timing").notNull().default(false),
  status: text("status").notNull().default("draft"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  totalCount: integer("total_count").notNull().default(0),
  sentCount: integer("sent_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const broadcastRecipients = pgTable(
  "broadcast_recipients",
  {
    id: text("id").primaryKey(),
    broadcastId: text("broadcast_id")
      .notNull()
      .references(() => broadcasts.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    error: text("error"),
    /** Smart timing: not before this moment. */
    sendAt: timestamp("send_at", { withTimezone: true }),
    /** A/B test arm: "a" or "b". */
    variant: text("variant"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("broadcast_recipients_unique").on(table.broadcastId, table.contactId)],
);

export const growthLinks = pgTable(
  "growth_links",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    tagName: text("tag_name"),
    flowId: text("flow_id").references(() => flows.id, { onDelete: "set null" }),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    clickCount: integer("click_count").notNull().default(0),
    startCount: integer("start_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("growth_links_bot_slug_idx").on(table.botId, table.slug)],
);

export const sequences = pgTable("sequences", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sequenceSteps = pgTable("sequence_steps", {
  id: text("id").primaryKey(),
  sequenceId: text("sequence_id")
    .notNull()
    .references(() => sequences.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  delaySeconds: integer("delay_seconds").notNull().default(0),
  body: text("body").notNull(),
  /** Send this flow instead of the body text. */
  flowId: text("flow_id").references(() => flows.id, { onDelete: "set null" }),
});

export const sequenceSubscriptions = pgTable(
  "sequence_subscriptions",
  {
    id: text("id").primaryKey(),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    nextIndex: integer("next_index").notNull().default(0),
    nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("active"),
  },
  (table) => [uniqueIndex("sequence_subscriptions_unique").on(table.sequenceId, table.contactId)],
);

export const automationRules = pgTable("automation_rules", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  triggerType: text("trigger_type").notNull(),
  triggerValue: text("trigger_value"),
  actionType: text("action_type").notNull(),
  actionValue: text("action_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const growthLinkEvents = pgTable("growth_link_events", {
  id: text("id").primaryKey(),
  linkId: text("link_id")
    .notNull()
    .references(() => growthLinks.id, { onDelete: "cascade" }),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Live Chat "send later": a teammate's reply queued for a time. */
export const scheduledMessages = pgTable("scheduled_messages", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  contactId: text("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
  /** pending | sending | sent | failed | cancelled */
  status: text("status").notNull().default("pending"),
  author: text("author"),
  /** Team member id of the author, so the send can assign an unassigned chat to them. */
  authorId: text("author_id"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Live Chat canned responses. ManyChat calls them Saved Replies; "/" in the composer searches them. */
export const savedReplies = pgTable("saved_replies", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Flow analytics: one row per start, message sent, button click, and completion. */
export const flowEvents = pgTable("flow_events", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  /** Null for goals not tied to a flow (e.g. a Stripe payment with no recent flow). */
  flowId: text("flow_id").references(() => flows.id, { onDelete: "cascade" }),
  stepId: text("step_id"),
  contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  /** Goal events: the goal name and its value (revenue). */
  name: text("name"),
  value: doublePrecision("value"),
  /** ISO currency of `value` (lowercase), when known. */
  currency: text("currency"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Public API keys (Bearer rly_…). Only a SHA-256 of the key is stored. */
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  prefix: text("prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Outgoing webhooks (Zapier / Make / your backend). Payloads are signed with X-Relay-Signature. */
export const webhookSubscriptions = pgTable("webhook_subscriptions", {
  id: text("id").primaryKey(),
  botId: text("bot_id")
    .notNull()
    .references(() => bots.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  secret: text("secret").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastStatus: integer("last_status"),
  lastError: text("last_error"),
  lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** People who answer in Live Chat. App-wide (one login), picked per browser. */
export const teamMembers = pgTable("team_members", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  color: text("color").notNull().default("#0084FF"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botsRelations = relations(bots, ({ many }) => ({
  contacts: many(contacts),
  tags: many(tags),
  flows: many(flows),
  growthLinks: many(growthLinks),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  bot: one(bots, { fields: [contacts.botId], references: [bots.id] }),
  tags: many(contactTags),
  fieldValues: many(contactFieldValues),
  messages: many(messages),
}));

/** Who did what: publishes, sends, erasures, merges, key changes. Shown under Settings → Activity. */
export const activityLog = pgTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    actor: text("actor"),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("activity_log_bot_idx").on(table.botId, table.createdAt)],
);

/** Provider event ids already handled (e.g. Stripe retries), so a redelivery is a no-op. */
export const processedEvents = pgTable(
  "processed_events",
  {
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.botId, table.source, table.eventId] })],
);

/**
 * A merged contact's other network identities: a message from `externalUserId` belongs to `contactId`
 * (and moves the reply route there), instead of creating a new contact and re-running the welcome.
 */
export const contactAliases = pgTable(
  "contact_aliases",
  {
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    externalUserId: text("external_user_id").notNull(),
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    platform: text("platform"),
    channelAccountId: text("channel_account_id"),
    threadId: text("thread_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.botId, table.externalUserId] })],
);

