import { and, eq, sql } from "drizzle-orm";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { flowEvents, flows } from "@/lib/db/schema";
import { loadAudienceMembers, segmentOptions } from "@/lib/store";
import { ContactsClient, type ContactRow } from "./contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect an account to see contacts.</p>;
  }
  const db = await getDb();
  const [members, options, flowRows, valueRows] = await Promise.all([
    loadAudienceMembers(bot.id),
    segmentOptions(bot.id),
    db.select({ id: flows.id, name: flows.name }).from(flows).where(eq(flows.botId, bot.id)),
    db
      .select({ contactId: flowEvents.contactId, value: sql<number>`coalesce(sum(${flowEvents.value}), 0)::float` })
      .from(flowEvents)
      .where(and(eq(flowEvents.botId, bot.id), eq(flowEvents.kind, "goal")))
      .groupBy(flowEvents.contactId),
  ]);
  const valueByContact = new Map(valueRows.map((row) => [row.contactId, Number(row.value)]));
  const rows: ContactRow[] = members
    .map((member) => ({
      id: member.id,
      name: [member.firstName, member.lastName].filter(Boolean).join(" ") || (member.username ? `@${member.username}` : member.telegramUserId),
      username: member.username,
      avatarUrl: member.avatarUrl,
      platform: member.platform,
      email: member.email,
      phone: member.phone,
      unsubscribed: member.unsubscribed,
      value: valueByContact.get(member.id) ?? 0,
      createdAt: new Date(member.createdAt).toISOString(),
      lastInboundAt: member.subject.lastInboundAt ? new Date(member.subject.lastInboundAt).toISOString() : null,
      subject: {
        ...member.subject,
        createdAt: new Date(member.createdAt).toISOString(),
        lastInboundAt: member.subject.lastInboundAt ? new Date(member.subject.lastInboundAt).toISOString() : null,
      },
    }))
    .sort((a, b) => (b.lastInboundAt ?? b.createdAt).localeCompare(a.lastInboundAt ?? a.createdAt));
  // One clock for server and client render, so "5m ago" labels hydrate identically.
  const renderedAt = new Date().getTime();
  return <ContactsClient botId={bot.id} initialRows={rows} options={options} flows={flowRows} renderedAt={renderedAt} />;
}
