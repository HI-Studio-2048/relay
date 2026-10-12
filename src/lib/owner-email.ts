import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots, users } from "@/lib/db/schema";
import { emailConfigured, renderEmail, sendEmail } from "@/lib/email";
import { publicUrl } from "@/lib/env";
import { log } from "@/lib/logger";

/** Tell the account's owner a conversation needs a person. Best effort: never throws, does nothing without SES. */
export async function emailOwnerOfHandoff(input: { botId: string; contactId: string; who: string; lastMessage?: string }) {
  if (!emailConfigured()) return;
  try {
    const db = await getDb();
    const [row] = await db
      .select({ email: users.email, bot: bots.name })
      .from(bots)
      .innerJoin(users, eq(users.id, bots.ownerId))
      .where(eq(bots.id, input.botId))
      .limit(1);
    if (!row) return;
    const origin = publicUrl();
    const mail = renderEmail({
      heading: `${input.who} needs a person`,
      paragraphs: [
        `The AI assistant on ${row.bot} handed this conversation to your team and paused itself for a day.`,
        ...(input.lastMessage ? [`Their last message: "${input.lastMessage.slice(0, 300)}"`] : []),
      ],
      ...(origin ? { action: { label: "Open the conversation", url: `${origin}/inbox/${input.contactId}` } } : {}),
    });
    await sendEmail({ to: row.email, subject: `${input.who} needs a person on ${row.bot}`, ...mail });
  } catch (error) {
    log.warn("Hand-off email failed", error instanceof Error ? error.message : error);
  }
}
