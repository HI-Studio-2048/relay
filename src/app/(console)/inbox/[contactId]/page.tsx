import { notFound } from "next/navigation";
import { ownsBot, resourceBotId } from "@/lib/auth/resources";
import { listMessages, loadContactRecord } from "@/lib/store";
import { ThreadView } from "./thread-view";

export const dynamic = "force-dynamic";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const botId = await resourceBotId("contact", contactId);
  if (!botId || !(await ownsBot(botId))) notFound();
  const contact = await loadContactRecord(contactId);
  if (!contact) notFound();
  const messages = await listMessages(contactId);
  return (
    <ThreadView
      contactId={contactId}
      botId={botId}
      initialContact={contact}
      initialMessages={messages.map((message) => ({
        id: message.id,
        direction: message.direction,
        source: message.source,
        body: message.body,
        author: message.author,
        createdAt:
          message.createdAt instanceof Date
            ? message.createdAt.toISOString()
            : String(message.createdAt),
      }))}
    />
  );
}
