import { MessageSquareText } from "lucide-react";
import { ConnectPrompt } from "@/components/chrome/connect-prompt";
import { EmptyState } from "@/components/chrome/empty-state";
import { PageHeader } from "@/components/chrome/page-header";
import { MANYCHAT } from "@/components/chrome/tone";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { compareKeywordPriority, isKeywordTrigger, type KeywordTriggerType } from "@/lib/keywords";
import { KeywordsBoard } from "./keywords-board";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const bot = await currentBot();
  if (!bot) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Automate"
          icon={MessageSquareText}
          tone="content"
          title="Keywords"
          description="ManyChat Keywords tab: rule, linked automation, and list priority."
        />
        <ConnectPrompt title="Connect a bot before creating keywords" />
      </div>
    );
  }

  const db = await getDb();
  const all = await db.select().from(flows).where(eq(flows.botId, bot.id));
  const others = all
    .filter((flow) => !isKeywordTrigger(flow.triggerType) && flow.isActive)
    .map((flow) => ({ id: flow.id, name: flow.name, triggerType: flow.triggerType, triggerValue: flow.triggerValue, isActive: flow.isActive, priority: flow.priority ?? 0 }));
  const rows = all
    .filter((flow) => isKeywordTrigger(flow.triggerType))
    .sort(compareKeywordPriority)
    .map((flow) => ({
      id: flow.id,
      name: flow.name,
      triggerType: flow.triggerType as KeywordTriggerType,
      triggerValue: flow.triggerValue,
      isActive: flow.isActive,
      priority: flow.priority ?? 0,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automate"
        icon={MessageSquareText}
        tone="content"
        title="Keywords"
        description="DM keyword rules: message is, contains, whole word, begins with, and doesn't contain. Top of the list wins when several match — test a message below and Recatch flags keywords another flow steals."
      />
      <KeywordsBoard botId={bot.id} initial={rows} others={others} />
      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          hex={MANYCHAT.content}
          title="No keywords yet"
          description="Create a keyword, then edit the linked flow. Unmatched messages fall through to Default reply."
        />
      ) : null}
    </div>
  );
}
