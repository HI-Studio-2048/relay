import { Repeat } from "lucide-react";
import { ConnectPrompt } from "@/components/chrome/connect-prompt";
import { EmptyState } from "@/components/chrome/empty-state";
import { PageHeader } from "@/components/chrome/page-header";
import { CanvasCard, MANYCHAT } from "@/components/chrome/tone";
import { SequenceCard } from "./sequence-card";
import { currentBot } from "@/lib/current-bot";
import { listSequences } from "@/lib/sequences";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CreateSequenceForm } from "./create-sequence-form";

export const dynamic = "force-dynamic";

function formatDelay(seconds: number) {
  if (seconds === 0) return "0";
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export default async function SequencesPage() {
  const bot = await currentBot();
  if (!bot) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Automate"
          icon={Repeat}
          tone="action"
          title="Sequences"
          description="ManyChat-style drips. Subscribe a contact to a list with the same name as the sequence."
        />
        <ConnectPrompt title="Connect a bot before creating sequences" />
      </div>
    );
  }

  const db = await getDb();
  const [rows, flowRows] = await Promise.all([
    listSequences(bot.id),
    db.select({ id: flows.id, name: flows.name }).from(flows).where(eq(flows.botId, bot.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automate"
        icon={Repeat}
        tone="action"
        title="Sequences"
        description="A named drip of delayed messages or flows. A Subscribe step whose list name matches the sequence enrolls the contact. Stop / Unsubscribe opts them out of all sequences."
      />
      <CanvasCard className="p-4">
        <CreateSequenceForm botId={bot.id} flows={flowRows} />
      </CanvasCard>
      {rows.length === 0 ? (
        <EmptyState
          icon={Repeat}
          hex={MANYCHAT.action}
          title="No sequences yet"
          description="Create a welcome drip. Then add a Subscribe step named the same as the sequence, or a Rule that enrolls when a tag is applied."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((sequence) => (
            <SequenceCard
              key={sequence.id}
              sequence={{
                id: sequence.id,
                botId: sequence.botId,
                name: sequence.name,
                isActive: sequence.isActive,
                stats: sequence.stats,
                steps: sequence.steps.map((step) => ({
                  id: step.id,
                  label: `wait ${formatDelay(step.delaySeconds)} — ${
                    step.flowId ? `flow “${flowRows.find((flow) => flow.id === step.flowId)?.name ?? "deleted flow"}”` : step.body
                  }`,
                })),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
