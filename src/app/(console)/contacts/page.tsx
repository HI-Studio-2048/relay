import { eq } from "drizzle-orm";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { loadAudienceMembers, segmentOptions } from "@/lib/store";
import { ContactsClient, type ContactRow } from "./contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect an account to see contacts.</p>;
  }
  const db = await getDb();
  const [members, options, flowRows] = await Promise.all([
    loadAudienceMembers(bot.id),
    segmentOptions(bot.id),
    db.select({ id: flows.id, name: flows.name }).from(flows).where(eq(flows.botId, bot.id)),
  ]);
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
      createdAt: new Date(member.createdAt).toISOString(),
      lastInboundAt: member.subject.lastInboundAt ? new Date(member.subject.lastInboundAt).toISOString() : null,
      subject: {
        ...member.subject,
        createdAt: new Date(member.createdAt).toISOString(),
        lastInboundAt: member.subject.lastInboundAt ? new Date(member.subject.lastInboundAt).toISOString() : null,
      },
    }))
    .sort((a, b) => (b.lastInboundAt ?? b.createdAt).localeCompare(a.lastInboundAt ?? a.createdAt));
  return <ContactsClient botId={bot.id} initialRows={rows} options={options} flows={flowRows} />;
}
