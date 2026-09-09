import Link from "next/link";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { CreateFlowForm } from "./create-flow-form";

export const dynamic = "force-dynamic";

export default async function FlowsPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect a bot first.</p>;
  }
  const db = await getDb();
  const rows = await db.select().from(flows).where(eq(flows.botId, bot.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">Flows</h1>
        <p className="text-sm text-muted-foreground">
          Triggers: /start, a command, or an exact keyword. Open a flow to edit it on the
          canvas — drag nodes, connect branches, then save. Telegram still runs the same
          linear definition.
        </p>
      </div>
      <CreateFlowForm botId={bot.id} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No flows yet. Connecting a bot seeds lead capture.</p>
      ) : (
        <div className="divide-y rounded-xl ring-1 ring-foreground/10">
          {rows.map((flow) => (
            <Link
              key={flow.id}
              href={`/flows/${flow.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/40"
            >
              <div>
                <p className="font-medium">{flow.name}</p>
                <p className="text-xs text-muted-foreground">
                  {flow.triggerType}
                  {flow.triggerValue ? ` · ${flow.triggerValue}` : ""}
                </p>
              </div>
              <Badge variant={flow.isActive ? "default" : "outline"}>
                {flow.isActive ? "active" : "off"}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
