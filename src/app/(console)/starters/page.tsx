import { eq } from "drizzle-orm";
import { MessageCircleQuestion } from "lucide-react";
import { PageHeader } from "@/components/chrome/page-header";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { bots, flows } from "@/lib/db/schema";
import { readHours, readStarters } from "@/lib/starters";
import { StartersForm } from "./starters-form";

export const dynamic = "force-dynamic";

export default async function StartersPage() {
  const bot = await currentBot();
  if (!bot) return <p className="text-sm text-muted-foreground">Connect an account first.</p>;
  const db = await getDb();
  const [[row], flowRows] = await Promise.all([
    db.select().from(bots).where(eq(bots.id, bot.id)).limit(1),
    db.select({ id: flows.id, name: flows.name }).from(flows).where(eq(flows.botId, bot.id)),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automate"
        title="Conversation starters"
        icon={MessageCircleQuestion}
        tone="content"
        description="What people see before they type: Instagram ice breakers and the Messenger menu, each opening a flow. Plus business hours with an away message."
      />
      <StartersForm botId={bot.id} channel={bot.channel} flows={flowRows} initialStarters={readStarters(row?.settings)} initialHours={readHours(row?.settings)} />
    </div>
  );
}
