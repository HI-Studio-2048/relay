import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { contacts, customFields, tags } from "@/lib/db/schema";
import { loadContactRecord } from "@/lib/store";
import { ContactEditor } from "./contact-editor";

export const dynamic = "force-dynamic";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await loadContactRecord(id);
  if (!contact) notFound();
  const db = await getDb();
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  const [fieldRows, tagRows] = await Promise.all([
    db.select().from(customFields).where(eq(customFields.botId, row!.botId)),
    db.select().from(tags).where(eq(tags.botId, row!.botId)),
  ]);
  return (
    <ContactEditor
      botId={row!.botId}
      initialContact={contact}
      initialFields={fieldRows}
      initialTags={tagRows}
    />
  );
}
