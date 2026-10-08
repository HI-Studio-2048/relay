import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ownsBot } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { contacts, customFields, tags } from "@/lib/db/schema";
import { listMessages, loadContactRecord } from "@/lib/store";
import { ThreadView } from "./thread-view";

export const dynamic = "force-dynamic";

export default async function ThreadPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const db = await getDb();
  const [row] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
  if (!row || !(await ownsBot(row.botId))) notFound();
  const contact = await loadContactRecord(contactId);
  if (!contact) notFound();
  const [messages, tagRows, fieldRows] = await Promise.all([
    listMessages(contactId),
    db.select().from(tags).where(eq(tags.botId, row.botId)),
    db.select().from(customFields).where(eq(customFields.botId, row.botId)),
  ]);
  return (
    <ThreadView
      key={contactId}
      botId={row.botId}
      contactId={contactId}
      initialContact={contact}
      initialTags={tagRows.map((tag) => ({ id: tag.id, name: tag.name }))}
      initialFields={fieldRows.map((field) => ({ key: field.key, label: field.label }))}
      initialMessages={messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        source: message.source,
        body: message.body,
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : String(message.createdAt),
      }))}
    />
  );
}
