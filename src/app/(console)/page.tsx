import Link from "next/link";
import { Inbox, LayoutDashboard, Megaphone, TriangleAlert, Users, Workflow } from "lucide-react";
import { ConnectPrompt } from "@/components/chrome/connect-prompt";
import { EmptyState } from "@/components/chrome/empty-state";
import { AvatarMark, ListPanel, ListRow } from "@/components/chrome/list-panel";
import { PageHeader } from "@/components/chrome/page-header";
import { Panel } from "@/components/chrome/panel";
import { Section } from "@/components/chrome/section";
import { StatusPill } from "@/components/chrome/status-pill";
import { CanvasCard, MANYCHAT, ToneChip, ToneLabel } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { broadcasts, flows } from "@/lib/db/schema";
import { relativeTime } from "@/lib/format";
import { displayName } from "@/lib/lead-capture";
import { listInbox, loadContactRecord, searchContacts } from "@/lib/store";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const bot = await currentBot();

  if (!bot) {
    return (
      <div className="space-y-6 py-4">
        <PageHeader
          eyebrow="Workspace"
          icon={LayoutDashboard}
          tone="start"
          title="Relay is ready for a bot"
          description="HI Studio’s Telegram inbox: capture leads on /start, tag contacts, and broadcast only after an explicit confirm."
        />
        <ConnectPrompt />
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
  const awaitingRows = broadcastRows.filter((row) => row.status === "awaiting_confirm");
  const stats = [
    { label: "Contacts", value: people.length, href: "/contacts", icon: Users, tone: "input" as const },
    { label: "Leads tagged", value: people.filter((c) => c?.tags.includes("lead")).length, href: "/contacts", icon: Users, tone: "start" as const },
    { label: "Open threads", value: threads.length, href: "/inbox", icon: Inbox, tone: "content" as const },
    { label: "Awaiting confirm", value: awaitingRows.length, href: "/broadcasts", icon: Megaphone, tone: "action" as const },
  ];
  const recentThreads = await Promise.all(
    threads.slice(0, 5).map(async (row) => {
      const contact = await loadContactRecord(row.contact.id);
      return {
        id: row.contact.id,
        name: contact ? displayName(contact) : row.contact.telegramUserId,
        lastAt: row.lastAt,
      };
    }),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        icon={LayoutDashboard}
        tone="start"
        title="Overview"
        description={`${bot.name}${bot.telegramUsername ? ` · @${bot.telegramUsername}` : ""}${flowRows[0] ? ` · ${flowRows[0].name}` : ""}`}
        actions={<StatusPill status={bot.status} />}
      />

      {bot.lastHealthError ? (
        <Panel
          tone="stop"
          icon={TriangleAlert}
          label="Health"
          title="Webhook needs attention"
          description={bot.lastHealthError}
        >
          <Button render={<Link href="/setup" />} variant="outline">
            Fix connection in Settings
          </Button>
        </Panel>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className="group">
              <CanvasCard className="h-full p-4 transition-colors group-hover:bg-[#fafbfc]">
                <div className="flex items-center gap-2">
                  <ToneChip tone={item.tone} icon={Icon} />
                  <ToneLabel tone={item.tone}>{item.label}</ToneLabel>
                </div>
                <p className="mt-3 font-heading text-3xl tracking-tight text-[#1b1f24]">{item.value}</p>
              </CanvasCard>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Recent conversations"
          action={
            <Button render={<Link href="/inbox" />} variant="ghost" size="sm">
              Inbox
            </Button>
          }
        >
          {recentThreads.length === 0 ? (
            <EmptyState
              icon={Inbox}
              hex={MANYCHAT.content}
              title="No threads yet"
              description="Inbound Telegram messages show up here and in Inbox."
            />
          ) : (
            <ListPanel>
              {recentThreads.map((thread) => (
                <ListRow
                  key={thread.id}
                  href={`/inbox/${thread.id}`}
                  leading={<AvatarMark name={thread.name} />}
                  title={thread.name}
                  meta={relativeTime(thread.lastAt)}
                />
              ))}
            </ListPanel>
          )}
        </Section>

        <Section
          title="Needs confirm"
          action={
            <Button render={<Link href="/broadcasts" />} variant="ghost" size="sm">
              Broadcasts
            </Button>
          }
        >
          {awaitingRows.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              hex={MANYCHAT.action}
              title="Nothing waiting"
              description="Tag-scoped drafts stay here until you type CONFIRM."
            />
          ) : (
            <ListPanel>
              {awaitingRows.slice(0, 5).map((row) => (
                <ListRow
                  key={row.id}
                  href={`/broadcasts/${row.id}`}
                  title={row.name}
                  subtitle={`${row.totalCount} tagged`}
                  trailing={<StatusPill status={row.status} />}
                />
              ))}
            </ListPanel>
          )}
        </Section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          tone="content"
          icon={Workflow}
          label="Flow"
          title="Lead capture"
          description="Connecting a bot seeds name → email → phone → company, then tags lead. Open it from Flows or message the bot with /start."
        >
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/flows" />} variant="outline">
              <Workflow className="size-4" />
              Open flows
            </Button>
            <Button render={<Link href="/inbox" />} variant="ghost">
              Inbox
            </Button>
          </div>
        </Panel>
        <Panel
          tone="action"
          icon={Megaphone}
          label="Broadcast"
          title="Broadcasts stay gated"
          description="Compose a tag-scoped draft, then type CONFIRM on the detail page. Nothing queues without that phrase."
        >
          <Button render={<Link href="/broadcasts" />} variant="outline">
            <Megaphone className="size-4" />
            Review broadcasts
          </Button>
        </Panel>
      </div>
    </div>
  );
}
