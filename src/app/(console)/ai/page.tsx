import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/chrome/page-header";
import { aiConfigured, readAiSettings } from "@/lib/ai";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { AiSettingsForm } from "./ai-settings-form";

export const dynamic = "force-dynamic";

export default async function AiPage() {
  const bot = await currentBot();
  if (!bot) return <p className="text-sm text-muted-foreground">Connect an account first.</p>;
  const db = await getDb();
  const [row] = await db.select().from(bots).where(eq(bots.id, bot.id)).limit(1);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automate"
        title="AI assistant"
        icon={Sparkles}
        tone="action"
        description="Teach Claude your business once. It powers AI Steps in flows, answers messages nothing else catches, drafts replies in Live Chat, and builds flows from a sentence."
      />
      <AiSettingsForm botId={bot.id} configured={aiConfigured()} initial={readAiSettings(row?.settings)} />
    </div>
  );
}
