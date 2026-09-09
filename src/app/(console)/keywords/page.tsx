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
  const rows = (await db.select().from(flows).where(eq(flows.botId, bot.id)))
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
        description="Five Telegram rules from ManyChat Help: Message is, contains, whole word, begins with, and doesn't contain. Thumbs Up is Messenger-only. Top of the list wins when several keywords match."
      />
      <KeywordsBoard botId={bot.id} initial={rows} />
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
