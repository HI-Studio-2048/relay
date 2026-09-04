import { eq } from "drizzle-orm";
import { encryptSecret, randomSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots, broadcasts, contacts, messages, tags } from "@/lib/db/schema";
import { json, fail } from "@/lib/http";
import { publicBot } from "@/lib/bots";
import { persistContact, saveMessage, seedBotDefaults } from "@/lib/store";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return json({ error: "Not found" }, 404);
  }

  try {
    const db = await getDb();
    const existing = await db.select().from(bots);
    let bot = existing[0];
    if (!bot) {
      const id = crypto.randomUUID();
      await db.insert(bots).values({
        id,
        name: "@relay_demo_bot",
        telegramUsername: "relay_demo_bot",
        telegramBotId: "0",
        tokenEncrypted: encryptSecret("0:demo-not-a-real-token"),
        webhookSecret: randomSecret(),
        webhookUrl: null,
        status: "disconnected",
        lastHealthError: "Demo bot — connect a real BotFather token for Telegram.",
      });
      await seedBotDefaults(id);
      const [created] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
      bot = created!;
    } else {
      await seedBotDefaults(bot.id);
    }

    const contactId = "demo-contact-daniel";
    await persistContact(bot.id, {
      id: contactId,
      telegramUserId: "1001",
      username: "daniel",
      firstName: "Daniel",
      lastName: "Philip",
      email: "daniel@histudio.test",
      phone: "+15551212",
      customFields: { company: "HI Studio" },
      tags: ["lead"],
    });

    const existingMessages = await db.select().from(messages).where(eq(messages.contactId, contactId));
    if (existingMessages.length === 0) {
      await saveMessage({
        botId: bot.id,
        contactId,
        direction: "inbound",
        source: "user",
        body: "/start",
      });
      await saveMessage({
        botId: bot.id,
        contactId,
        direction: "outbound",
        source: "flow",
        body: "Hey — this is HI Studio. Want to leave your details so we can follow up?",
      });
      await saveMessage({
        botId: bot.id,
        contactId,
        direction: "inbound",
        source: "user",
        body: "Daniel Philip",
      });
    }

    const openBroadcasts = await db
      .select()
      .from(broadcasts)
      .where(eq(broadcasts.botId, bot.id));
    let broadcast = openBroadcasts.find((row) => row.status === "awaiting_confirm");
    if (!broadcast) {
      const tagRows = await db.select().from(tags).where(eq(tags.botId, bot.id));
      const lead = tagRows.find((row) => row.name === "lead") ?? tagRows[0];
      if (lead) {
        const [created] = await db
          .insert(broadcasts)
          .values({
            id: crypto.randomUUID(),
            botId: bot.id,
            name: "Demo follow-up",
            body: "Thanks for leaving your details — HI Studio will follow up shortly.",
            tagId: lead.id,
            status: "awaiting_confirm",
            totalCount: 1,
          })
          .returning();
        broadcast = created;
      }
    }

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId)).limit(1);
    return json({ bot: publicBot(bot), contact, broadcast });
  } catch (error) {
    return fail(error, "Seed failed");
  }
}
