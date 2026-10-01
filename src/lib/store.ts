import { and, desc, eq, ilike, isNotNull, lte, notInArray, notLike, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  bots,
  broadcastRecipients,
  broadcasts,
  contactFieldValues,
  contactTags,
  contacts,
  customFields,
  flowSessions,
  flows,
  messages,
  tags,
} from "@/lib/db/schema";
import { isBroadcastable } from "@/lib/broadcast";
import { matchesSegment, type Segment, type SegmentSubject } from "@/lib/segments";
import { emitWebhookSoon, publicContact } from "@/lib/developer";
import { fireContactRules } from "@/lib/rules";
import { syncContactSequences } from "@/lib/sequences";
import { EXAMPLE_GROWTH_LINK_FLOW, EXAMPLE_LEAD_CAPTURE_FLOW } from "@/lib/example-flow";
import type { ContactRecord, FlowDefinition, FlowSessionState } from "@/lib/types";
import type { FlowRecord } from "@/lib/flow-engine";

function now() {
  return new Date();
}

export async function loadContactRecord(contactId: string): Promise<ContactRecord | null> {
  const db = await getDb();
  const [row] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!row) return null;
  const fieldRows = await db
    .select({ key: customFields.key, value: contactFieldValues.value })
    .from(contactFieldValues)
    .innerJoin(customFields, eq(customFields.id, contactFieldValues.fieldId))
    .where(eq(contactFieldValues.contactId, contactId));
  const tagRows = await db
    .select({ name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(eq(contactTags.contactId, contactId));
  return {
    id: row.id,
    telegramUserId: row.telegramUserId,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    customFields: Object.fromEntries(fieldRows.map((field) => [field.key, field.value])),
    tags: tagRows.map((tag) => tag.name),
    subscriptions: row.subscriptions ?? [],
    unsubscribed: row.unsubscribed ?? false,
    welcomed: row.welcomed ?? false,
    notes: row.notes ?? "",
    inboxStatus: row.inboxStatus === "closed" ? "closed" : "open",
    platform: row.platform ?? null,
    channelAccountId: row.channelAccountId ?? null,
    threadId: row.threadId ?? null,
    avatarUrl: row.avatarUrl ?? null,
    botPausedUntil: row.botPausedUntil ? new Date(row.botPausedUntil).toISOString() : null,
  };
}

export async function findContactByTelegram(botId: string, telegramUserId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.botId, botId), eq(contacts.telegramUserId, telegramUserId)))
    .limit(1);
  if (!row) return null;
  return loadContactRecord(row.id);
}

export async function persistContact(
  botId: string,
  record: ContactRecord,
  options: { skipRules?: boolean } = {},
) {
  const db = await getDb();
  const existing = await db.select().from(contacts).where(eq(contacts.id, record.id)).limit(1);
  const previous = existing[0] && !options.skipRules ? await loadContactRecord(record.id) : null;
  const values = {
    username: record.username,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    phone: record.phone,
    unsubscribed: record.unsubscribed ?? false,
    subscriptions: record.subscriptions ?? [],
    welcomed: record.welcomed ?? false,
    notes: record.notes ?? "",
    inboxStatus: record.inboxStatus === "closed" ? "closed" : "open",
    // Routing only ever fills in: a record built without it (older callers) keeps what is stored.
    ...(record.platform ? { platform: record.platform } : {}),
    ...(record.channelAccountId ? { channelAccountId: record.channelAccountId } : {}),
    ...(record.threadId ? { threadId: record.threadId } : {}),
    ...(record.avatarUrl ? { avatarUrl: record.avatarUrl } : {}),
    updatedAt: now(),
  };
  if (existing[0]) {
    await db.update(contacts).set(values).where(eq(contacts.id, record.id));
  } else {
    await db.insert(contacts).values({
      id: record.id,
      botId,
      telegramUserId: record.telegramUserId,
      ...values,
      createdAt: now(),
    });
    emitWebhookSoon(botId, "contact.created", { contact: publicContact(record) });
  }

  const fieldDefs = await db.select().from(customFields).where(eq(customFields.botId, botId));
  const byKey = new Map(fieldDefs.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(record.customFields)) {
    let field = byKey.get(key);
    if (!field) {
      field = {
        id: crypto.randomUUID(),
        botId,
        key,
        label: key,
        fieldType: "text",
      };
      await db.insert(customFields).values(field);
      byKey.set(key, field);
    }
    await db
      .insert(contactFieldValues)
      .values({ contactId: record.id, fieldId: field.id, value })
      .onConflictDoUpdate({
        target: [contactFieldValues.contactId, contactFieldValues.fieldId],
        set: { value },
      });
  }
  const keptFieldIds = [...byKey.values()].filter((field) => field.key in record.customFields).map((field) => field.id);
  await db
    .delete(contactFieldValues)
    .where(
      keptFieldIds.length
        ? and(eq(contactFieldValues.contactId, record.id), notInArray(contactFieldValues.fieldId, keptFieldIds))
        : eq(contactFieldValues.contactId, record.id),
    );

  const wanted = new Set(record.tags);
  const existingLinks = await db
    .select({ tagId: contactTags.tagId, name: tags.name })
    .from(contactTags)
    .innerJoin(tags, eq(tags.id, contactTags.tagId))
    .where(eq(contactTags.contactId, record.id));
  for (const link of existingLinks) {
    if (!wanted.has(link.name)) {
      await db
        .delete(contactTags)
        .where(and(eq(contactTags.contactId, record.id), eq(contactTags.tagId, link.tagId)));
    }
  }

  for (const tagName of record.tags) {
    let [tag] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.botId, botId), eq(tags.name, tagName)))
      .limit(1);
    if (!tag) {
      [tag] = await db
        .insert(tags)
        .values({ id: crypto.randomUUID(), botId, name: tagName, color: "#c4a574" })
        .returning();
    }
    await db
      .insert(contactTags)
      .values({ contactId: record.id, tagId: tag.id })
      .onConflictDoNothing();
  }

  await syncContactSequences(botId, record, existing[0]?.subscriptions ?? []);
  if (!options.skipRules) await fireContactRules(botId, previous, record);
}

export async function loadActiveSession(contactId: string): Promise<FlowSessionState | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(flowSessions)
    .where(
      and(
        eq(flowSessions.contactId, contactId),
        or(eq(flowSessions.status, "active"), eq(flowSessions.status, "paused")),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    contactId: row.contactId,
    flowId: row.flowId,
    stepId: row.stepId,
    awaitingInput: row.awaitingInput,
    status: row.status === "paused" ? "paused" : row.status === "completed" ? "completed" : "active",
    formIndex: row.formIndex ?? undefined,
    resumeAt: row.resumeAt ? row.resumeAt.toISOString() : null,
  };
}

/** How long a human reply keeps the bot quiet for that person (ManyChat pauses automation on takeover). */
export const AGENT_PAUSE_MINUTES = 60;

/**
 * Live Chat takeover: pause the flow the contact is in, and keep every automation (keywords,
 * default reply, AI auto-reply) quiet for them for `minutes` (or until someone resumes).
 */
export async function pauseContactAutomation(contactId: string, minutes = AGENT_PAUSE_MINUTES) {
  const db = await getDb();
  await db
    .update(contacts)
    .set({ botPausedUntil: new Date(Date.now() + minutes * 60_000) })
    .where(eq(contacts.id, contactId));
  const session = await loadActiveSession(contactId);
  if (!session || session.status === "paused") return;
  await persistSession(contactId, {
    ...session,
    status: "paused",
    awaitingInput: false,
    resumeAt: null,
  });
}

export function isBotPaused(row: { botPausedUntil?: Date | string | null }, now = Date.now()) {
  if (!row.botPausedUntil) return false;
  return new Date(row.botPausedUntil).getTime() > now;
}

/** Live Chat "Resume automation": un-pause the session and re-arm any question it was waiting on. */
export async function resumeContactAutomation(contactId: string) {
  const db = await getDb();
  await db.update(contacts).set({ botPausedUntil: null }).where(eq(contacts.id, contactId));
  const session = await loadActiveSession(contactId);
  if (!session || session.status !== "paused") return null;
  const [row] = await db.select().from(flows).where(eq(flows.id, session.flowId)).limit(1);
  const definition = row?.definition as FlowDefinition | undefined;
  const step = definition?.steps.find((item) => item.id === session.stepId);
  const awaitingInput =
    step?.type === "capture" ||
    step?.type === "form" ||
    step?.type === "ai" ||
    (step?.type === "text" && (step.quickReplies ?? []).length > 0);
  const next: FlowSessionState = { ...session, status: "active", awaitingInput, resumeAt: null };
  await persistSession(contactId, next);
  return next;
}

export async function persistSession(contactId: string, session: FlowSessionState | null) {
  const db = await getDb();
  await db.delete(flowSessions).where(eq(flowSessions.contactId, contactId));
  if (!session) return;
  await db.insert(flowSessions).values({
    id: session.id,
    contactId,
    flowId: session.flowId,
    stepId: session.stepId,
    awaitingInput: session.awaitingInput,
    status: session.status,
    formIndex: session.formIndex ?? null,
    resumeAt: session.resumeAt ? new Date(session.resumeAt) : null,
    updatedAt: now(),
  });
}

export async function listDueDelaySessions() {
  const db = await getDb();
  return db
    .select()
    .from(flowSessions)
    .where(
      and(eq(flowSessions.status, "active"), isNotNull(flowSessions.resumeAt), lte(flowSessions.resumeAt, new Date())),
    );
}

export async function loadActiveFlows(botId: string): Promise<FlowRecord[]> {
  const db = await getDb();
  const rows = await db.select().from(flows).where(eq(flows.botId, botId));
  return rows.map((row) => ({
    id: row.id,
    triggerType: row.triggerType as FlowRecord["triggerType"],
    triggerValue: row.triggerValue,
    isActive: row.isActive,
    priority: row.priority ?? 0,
    definition: row.definition as FlowDefinition,
  }));
}

export async function saveMessage(input: {
  botId: string;
  contactId: string;
  direction: "inbound" | "outbound";
  source: "user" | "flow" | "agent" | "broadcast" | "ai";
  body: string;
  telegramMessageId?: string | null;
  /** Team member name for agent replies. */
  author?: string | null;
}) {
  const db = await getDb();
  await db.insert(messages).values({
    id: crypto.randomUUID(),
    botId: input.botId,
    contactId: input.contactId,
    direction: input.direction,
    source: input.source,
    body: input.body,
    telegramMessageId: input.telegramMessageId ?? null,
    author: input.author ?? null,
  });
}

export async function listInbox(botId: string) {
  const db = await getDb();
  const latest = db
    .select({
      contactId: messages.contactId,
      lastAt: sql<Date>`max(${messages.createdAt})`.as("last_at"),
    })
    .from(messages)
    .where(eq(messages.botId, botId))
    .groupBy(messages.contactId)
    .as("latest");

  return db
    .select({
      contact: contacts,
      lastAt: latest.lastAt,
    })
    .from(latest)
    .innerJoin(contacts, eq(contacts.id, latest.contactId))
    .orderBy(desc(latest.lastAt));
}

export type InboxThread = {
  contactId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  platform: string | null;
  status: "open" | "closed";
  lastAt: string | null;
  lastBody: string;
  lastDirection: "inbound" | "outbound";
  /** The contact spoke last: someone should answer. */
  needsReply: boolean;
  assignedTo: string | null;
};

/** Live Chat list: one row per conversation with its latest message, newest first. */
export async function listInboxThreads(botId: string): Promise<InboxThread[]> {
  const db = await getDb();
  const latest = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.botId, botId),
        sql`${messages.createdAt} = (select max(m2.created_at) from messages m2 where m2.contact_id = ${messages.contactId})`,
      ),
    );
  const byContact = new Map<string, (typeof latest)[number]>();
  for (const message of latest) if (!byContact.has(message.contactId)) byContact.set(message.contactId, message);
  if (byContact.size === 0) return [];
  const rows = await db.select().from(contacts).where(eq(contacts.botId, botId));
  return rows
    .filter((row) => byContact.has(row.id))
    .map((row) => {
      const last = byContact.get(row.id)!;
      const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || (row.username ? `@${row.username}` : row.telegramUserId);
      return {
        contactId: row.id,
        name,
        username: row.username,
        avatarUrl: row.avatarUrl ?? null,
        platform: row.platform ?? null,
        status: row.inboxStatus === "closed" ? ("closed" as const) : ("open" as const),
        lastAt: last.createdAt ? new Date(last.createdAt).toISOString() : null,
        lastBody: last.body,
        lastDirection: last.direction === "outbound" ? ("outbound" as const) : ("inbound" as const),
        needsReply: last.direction === "inbound" && row.inboxStatus !== "closed",
        assignedTo: row.assignedTo ?? null,
      };
    })
    .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export async function listMessages(contactId: string) {
  const db = await getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.contactId, contactId))
    .orderBy(messages.createdAt);
}

export async function searchContacts(botId: string, query?: string, tagId?: string) {
  const db = await getDb();
  const filters = [eq(contacts.botId, botId)];
  if (query) {
    const like = `%${query}%`;
    filters.push(
      or(
        ilike(contacts.firstName, like),
        ilike(contacts.lastName, like),
        ilike(contacts.username, like),
        ilike(contacts.email, like),
        ilike(contacts.phone, like),
        ilike(contacts.telegramUserId, like),
      )!,
    );
  }
  let rows = await db
    .select()
    .from(contacts)
    .where(and(...filters))
    .orderBy(desc(contacts.updatedAt));
  if (tagId) {
    const tagged = await db
      .select({ contactId: contactTags.contactId })
      .from(contactTags)
      .where(eq(contactTags.tagId, tagId));
    const ids = new Set(tagged.map((row) => row.contactId));
    rows = rows.filter((row) => ids.has(row.id));
  }
  return Promise.all(rows.map((row) => loadContactRecord(row.id)));
}

export async function contactsWithTag(botId: string, tagId: string) {
  const db = await getDb();
  const rows = await db
    .select({ contact: contacts })
    .from(contactTags)
    .innerJoin(contacts, eq(contacts.id, contactTags.contactId))
    .where(and(eq(contactTags.tagId, tagId), eq(contacts.botId, botId)));
  return rows.map((row) => row.contact).filter((contact) => isBroadcastable(contact));
}

export type AudienceMember = typeof contacts.$inferSelect & { subject: SegmentSubject };

/**
 * Every contact of an account with what segments look at (tags, fields, lists, last inbound),
 * loaded in four queries instead of one per contact.
 */
export async function loadAudienceMembers(botId: string): Promise<AudienceMember[]> {
  const db = await getDb();
  const [rows, tagRows, fieldRows, inboundRows] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.botId, botId)),
    db
      .select({ contactId: contactTags.contactId, name: tags.name })
      .from(contactTags)
      .innerJoin(tags, eq(tags.id, contactTags.tagId))
      .where(eq(tags.botId, botId)),
    db
      .select({ contactId: contactFieldValues.contactId, key: customFields.key, value: contactFieldValues.value })
      .from(contactFieldValues)
      .innerJoin(customFields, eq(customFields.id, contactFieldValues.fieldId))
      .where(eq(customFields.botId, botId)),
    db
      .select({ contactId: messages.contactId, lastAt: sql<Date>`max(${messages.createdAt})` })
      .from(messages)
      // Comments are public and do not open a DM window, so they do not count as activity.
      .where(and(eq(messages.botId, botId), eq(messages.direction, "inbound"), notLike(messages.body, "[comment]%")))
      .groupBy(messages.contactId),
  ]);
  const tagsBy = new Map<string, string[]>();
  for (const row of tagRows) tagsBy.set(row.contactId, [...(tagsBy.get(row.contactId) ?? []), row.name]);
  const fieldsBy = new Map<string, Record<string, string>>();
  for (const row of fieldRows) fieldsBy.set(row.contactId, { ...(fieldsBy.get(row.contactId) ?? {}), [row.key]: row.value });
  const inboundBy = new Map(inboundRows.map((row) => [row.contactId, row.lastAt]));
  return rows.map((row) => ({
    ...row,
    subject: {
      tags: tagsBy.get(row.id) ?? [],
      email: row.email,
      phone: row.phone,
      firstName: row.firstName,
      lastName: row.lastName,
      customFields: fieldsBy.get(row.id) ?? {},
      subscriptions: row.subscriptions ?? [],
      platform: row.platform,
      createdAt: row.createdAt,
      lastInboundAt: inboundBy.get(row.id) ?? null,
    },
  }));
}

/**
 * Broadcast audience: subscribed contacts, narrowed to one tag (when tagId is set) and to a segment.
 * Unsubscribed contacts are never included.
 */
export async function broadcastAudience(botId: string, tagId: string | null | undefined, segment?: Segment | null) {
  const db = await getDb();
  let tagName: string | null = null;
  if (tagId) {
    const [tag] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
    if (!tag) return [];
    tagName = tag.name;
  }
  const members = await loadAudienceMembers(botId);
  const now = Date.now();
  return members.filter(
    (member) =>
      isBroadcastable(member) &&
      (!tagName || member.subject.tags.includes(tagName)) &&
      matchesSegment(member.subject, segment, now),
  );
}

/** Choices for segment builders: tags, custom fields, lists and platforms that exist on this account. */
export async function segmentOptions(botId: string) {
  const db = await getDb();
  const [tagRows, fieldRows, contactRows] = await Promise.all([
    db.select({ name: tags.name }).from(tags).where(eq(tags.botId, botId)),
    db.select({ key: customFields.key }).from(customFields).where(eq(customFields.botId, botId)),
    db.select({ subscriptions: contacts.subscriptions, platform: contacts.platform }).from(contacts).where(eq(contacts.botId, botId)),
  ]);
  const sorted = (values: Iterable<string>) => [...new Set(values)].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return {
    tags: sorted(tagRows.map((row) => row.name)),
    fields: sorted(fieldRows.map((row) => row.key).filter((key) => !key.startsWith("_"))),
    lists: sorted(contactRows.flatMap((row) => row.subscriptions ?? [])),
    platforms: sorted(contactRows.map((row) => row.platform ?? "")),
  };
}

export async function seedBotDefaults(botId: string) {
  const db = await getDb();
  const existingTags = await db.select().from(tags).where(eq(tags.botId, botId));
  if (existingTags.length === 0) {
    await db.insert(tags).values([
      { id: crypto.randomUUID(), botId, name: "lead", color: "#c4a574" },
      { id: crypto.randomUUID(), botId, name: "qualified", color: "#6f8f6a" },
    ]);
  }
  const existingFields = await db.select().from(customFields).where(eq(customFields.botId, botId));
  if (existingFields.length === 0) {
    await db.insert(customFields).values({
      id: crypto.randomUUID(),
      botId,
      key: "company",
      label: "Company",
      fieldType: "text",
    });
  }
  const existingFlows = await db.select().from(flows).where(eq(flows.botId, botId));
  if (existingFlows.length === 0) {
    await db.insert(flows).values([
      {
        id: crypto.randomUUID(),
        botId,
        name: "Lead capture",
        triggerType: "start",
        triggerValue: "/start",
        isActive: true,
        definition: EXAMPLE_LEAD_CAPTURE_FLOW,
      },
      {
        id: crypto.randomUUID(),
        botId,
        name: "Promo growth link",
        triggerType: "start_param",
        triggerValue: "promo",
        isActive: true,
        definition: EXAMPLE_GROWTH_LINK_FLOW,
      },
    ]);
  }
}
