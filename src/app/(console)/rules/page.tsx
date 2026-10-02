import { ListFilter } from "lucide-react";
import { ConnectPrompt } from "@/components/chrome/connect-prompt";
import { EmptyState } from "@/components/chrome/empty-state";
import { PageHeader } from "@/components/chrome/page-header";
import { CanvasCard, MANYCHAT } from "@/components/chrome/tone";
import { currentBot } from "@/lib/current-bot";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { flows, tags } from "@/lib/db/schema";
import { RULE_ACTIONS, RULE_TRIGGERS, listRules } from "@/lib/rules";
import { listSequences } from "@/lib/sequences";
import { RuleActions } from "./rule-actions";
import { CreateRuleForm } from "./create-rule-form";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const bot = await currentBot();
  if (!bot) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Automate"
          icon={ListFilter}
          tone="action"
          title="Rules"
          description="Global ManyChat-style rules. When a tag is applied, enroll the contact in a sequence."
        />
        <ConnectPrompt title="Connect a bot before creating rules" />
      </div>
    );
  }

  const db = await getDb();
  const [rules, sequences, tagRows, flowRows] = await Promise.all([
    listRules(bot.id),
    listSequences(bot.id),
    db.select().from(tags).where(eq(tags.botId, bot.id)),
    db.select().from(flows).where(eq(flows.botId, bot.id)),
  ]);
  const label = (list: readonly { value: string; label: string }[], value: string) =>
    list.find((item) => item.value === value)?.label ?? value.replaceAll("_", " ");
  const flowName = (id: string) => flowRows.find((flow) => flow.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
        <PageHeader
          eyebrow="Automate"
          icon={ListFilter}
          tone="action"
          title="Rules"
        description="When something happens to a contact — a tag, list or field changes, they are new, reach a goal, or rate a chat — run an action: sequence, tag, field, flow, assignment, or a team alert."
      />
      <CanvasCard className="p-4">
        <CreateRuleForm
          botId={bot.id}
          sequences={sequences.map((sequence) => sequence.name)}
          tags={tagRows.map((tag) => tag.name)}
          flows={flowRows.map((flow) => ({ id: flow.id, name: flow.name }))}
        />
      </CanvasCard>
      {rules.length === 0 ? (
        <EmptyState
          icon={ListFilter}
          hex={MANYCHAT.condition}
          title="No rules yet"
          description="Example: when tag lead is applied, subscribe to welcome_drip."
        />
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <CanvasCard key={rule.id} className="flex items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{rule.name}</p>
                <p className="text-sm text-muted-foreground">
                  When {label(RULE_TRIGGERS, rule.triggerType).toLowerCase()}
                  {rule.triggerValue?.trim() ? ` “${rule.triggerValue}”` : ""} →{" "}
                  {label(RULE_ACTIONS, rule.actionType).toLowerCase()} “
                  {rule.actionType === "start_flow" ? flowName(rule.actionValue ?? "") : rule.actionValue}”
                </p>
              </div>
              <RuleActions id={rule.id} botId={bot.id} isActive={rule.isActive} />
            </CanvasCard>
          ))}
        </div>
      )}
    </div>
  );
}
