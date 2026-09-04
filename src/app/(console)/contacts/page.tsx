import { eq } from "drizzle-orm";
import { listBots } from "@/lib/bots";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { searchContacts } from "@/lib/store";
import { ContactsClient } from "./contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const bots = await listBots();
  const bot = bots[0];
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
