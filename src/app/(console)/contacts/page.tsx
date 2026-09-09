import { eq } from "drizzle-orm";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { searchContacts } from "@/lib/store";
import { ContactsClient } from "./contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const bot = await currentBot();
  if (!bot) {
    return <ContactsClient initialBotId={null} initialContacts={[]} initialTags={[]} />;
  }
  const db = await getDb();
  const [contacts, tagRows] = await Promise.all([
    searchContacts(bot.id),
    db.select().from(tags).where(eq(tags.botId, bot.id)),
  ]);
  return (
    <ContactsClient
      initialBotId={bot.id}
      initialContacts={contacts.filter((contact): contact is NonNullable<typeof contact> => Boolean(contact))}
      initialTags={tagRows}
    />
  );
}
