import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ownsRow } from "@/lib/auth/resources";
import { channelOf } from "@/lib/channels/types";
import { getDb } from "@/lib/db";
import { bots, contacts } from "@/lib/db/schema";
import { listMessages, loadContactRecord } from "@/lib/store";
import { ThreadView } from "./thread-view";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  if (!(await ownsRow("contact", contactId))) notFound();
  const contact = await loadContactRecord(contactId);
  if (!contact) notFound();
  const db = await getDb();
  const [channel] = await db
    .select({ id: bots.id, name: bots.name, channel: bots.channel })
    .from(contacts)
    .innerJoin(bots, eq(bots.id, contacts.botId))
    .where(eq(contacts.id, contactId))
    .limit(1);
  const messages = await listMessages(contactId);
  return (
    <ThreadView
      key={contactId}
      contactId={contactId}
      channelAccount={channel ? { id: channel.id, name: channel.name, channel: channelOf(channel.channel) } : null}
      initialContact={contact}
      initialMessages={messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        source: message.source,
        body: message.body,
        author: message.author,
        media: message.media ?? null,
        createdAt:
          message.createdAt instanceof Date
            ? message.createdAt.toISOString()
            : String(message.createdAt),
      }))}
    />
  );
}
