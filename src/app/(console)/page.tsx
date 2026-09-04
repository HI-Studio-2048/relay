import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listBots } from "@/lib/bots";
import { getDb } from "@/lib/db";
import { broadcasts, flows } from "@/lib/db/schema";
import { listInbox, searchContacts } from "@/lib/store";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const bots = await listBots();
  const bot = bots[0];

  if (!bot) {
    return (
      <div className="mx-auto max-w-xl space-y-4 py-10">
        <h1 className="font-heading text-3xl tracking-tight">Connect a Telegram bot</h1>
        <p className="text-muted-foreground">
          Relay is the HI Studio inbox for Telegram: capture leads in a /start flow, tag
          contacts, and broadcast only after an explicit confirm.
        </p>
        <Button render={<Link href="/setup" />}>Paste a bot token</Button>
      </div>
    );
  }

  const db = await getDb();
  const [contacts, threads, broadcastRows, flowRows] = await Promise.all([
    searchContacts(bot.id),
    listInbox(bot.id),
    db.select().from(broadcasts).where(eq(broadcasts.botId, bot.id)),
    db.select().from(flows).where(eq(flows.botId, bot.id)),
  ]);
  const people = contacts.filter(Boolean);
  const stats = [
    { label: "Contacts", value: people.length, href: "/contacts" },
    { label: "Leads tagged", value: people.filter((c) => c?.tags.includes("lead")).length, href: "/contacts" },
    { label: "Open threads", value: threads.length, href: "/inbox" },
    {
      label: "Awaiting confirm",
      value: broadcastRows.filter((row) => row.status === "awaiting_confirm").length,
      href: "/broadcasts",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {bot.name} · webhook {bot.status}
            {flowRows[0] ? ` · ${flowRows[0].name}` : ""}
          </p>
        </div>
        <Badge variant={bot.status === "connected" ? "default" : "destructive"}>{bot.status}</Badge>
      </div>

      {bot.lastHealthError ? (
        <Card>
          <CardHeader>
            <CardTitle>Webhook needs attention</CardTitle>
            <CardDescription>{bot.lastHealthError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button render={<Link href="/setup" />} variant="outline">
              Fix bot connection
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => (
          <Link key={item.label} href={item.href}>
            <Card className="h-full hover:ring-foreground/20">
              <CardHeader>
                <CardDescription>{item.label}</CardDescription>
                <CardTitle className="text-3xl">{item.value}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Example /start lead capture</CardTitle>
          <CardDescription>
            Connecting a bot seeds an active flow: name → email → phone → company → tag{" "}
            <code>lead</code>. Open it from Flows or message the bot with /start.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button render={<Link href="/flows" />} variant="outline">
            Edit the flow
          </Button>
          <Button render={<Link href="/inbox" />} variant="ghost">
            Open inbox
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
