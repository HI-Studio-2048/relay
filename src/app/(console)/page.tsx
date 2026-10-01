import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Bot, CheckCircle2, Circle, Inbox, LayoutDashboard, MessagesSquare, TriangleAlert, Trophy, Users, Workflow } from "lucide-react";
import { DailyColumns, PlatformBars } from "@/components/charts";
import { ContactAvatar } from "@/components/chrome/avatar";
import { ConnectPrompt } from "@/components/chrome/connect-prompt";
import { PageHeader } from "@/components/chrome/page-header";
import { Panel } from "@/components/chrome/panel";
import { StatusPill } from "@/components/chrome/status-pill";
import { CanvasCard, ToneChip, type ToneName } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { CHANNELS } from "@/lib/channels/types";
import { currentBot } from "@/lib/current-bot";
import { loadChecklist, loadDashboard, loadTeamReport } from "@/lib/dashboard";
import { formatDuration } from "@/lib/team-report";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function StatTile({
  label,
  value,
  detail,
  delta,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: number | null;
  icon: LucideIcon;
  tone: ToneName;
  href: string;
}) {
  return (
    <Link href={href}>
      <CanvasCard className="h-full space-y-2 p-4 transition-shadow hover:shadow-md">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-medium text-[#6b7280]">{label}</p>
          <ToneChip tone={tone} icon={icon} className="size-6" />
        </div>
        <p className="font-heading text-2xl tabular-nums text-[#1b1f24]">{value}</p>
        <p className="flex items-center gap-1 text-[12px] text-[#6b7280]">
          {delta !== undefined && delta !== null ? (
            <span className="flex items-center font-medium text-[#1b1f24]">
              {delta >= 0 ? <ArrowUpRight className="size-3.5 text-[#00a344]" /> : <ArrowDownRight className="size-3.5 text-red-600" />}
              {delta >= 0 ? "+" : ""}
              {delta}%
            </span>
          ) : null}
          {detail}
        </p>
      </CanvasCard>
    </Link>
  );
}

function relative(iso: string | null) {
  if (!iso) return "";
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export default async function OverviewPage() {
  const bot = await currentBot();
  if (!bot) {
    return (
      <div className="space-y-6 py-4">
        <PageHeader
          eyebrow="Workspace"
          icon={LayoutDashboard}
          tone="start"
          title="Relay is ready for your accounts"
          description="Comment-to-DM, story replies, AI conversations, a shared inbox and segmented broadcasts across every social network."
        />
        <ConnectPrompt />
      </div>
    );
  }

  const [data, checklist, team] = await Promise.all([loadDashboard(bot.id), loadChecklist(bot.id), loadTeamReport(bot.id)]);
  const remaining = checklist.filter((item) => !item.done);
  const weekDelta = data.newPreviousWeek > 0 ? Math.round(((data.newThisWeek - data.newPreviousWeek) / data.newPreviousWeek) * 100) : null;
  const automatedShare = data.week.outbound ? Math.round((data.week.automated / data.week.outbound) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        icon={LayoutDashboard}
        tone="start"
        title="Overview"
        description={`${bot.name} · ${CHANNELS[bot.channel].label}`}
        actions={<StatusPill status={bot.status} />}
      />

      {bot.lastHealthError ? (
        <Panel tone="stop" icon={TriangleAlert} label="Needs attention" description={bot.lastHealthError}>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/setup" />}>
            Open Settings
          </Button>
        </Panel>
      ) : null}

      {remaining.length > 0 ? (
        <CanvasCard className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-[15px] text-[#1b1f24]">Get set up</p>
            <p className="text-[12px] text-[#6b7280]">
              {checklist.length - remaining.length} of {checklist.length} done
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-[#f1f3f5]">
            <div className="h-full rounded-full bg-[#00c853]" style={{ width: `${((checklist.length - remaining.length) / checklist.length) * 100}%` }} />
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {checklist.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-start gap-2 rounded-xl p-2.5 ring-1",
                    item.done ? "ring-[#e5e7eb] opacity-60" : "ring-[#e5e7eb] hover:bg-[#f9fafb]",
                  )}
                >
                  {item.done ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#00c853]" />
                  ) : (
                    <Circle className="mt-0.5 size-4 shrink-0 text-[#c5cdd6]" />
                  )}
                  <span>
                    <span className={cn("block text-[13px] font-medium text-[#1b1f24]", item.done && "line-through")}>{item.label}</span>
                    <span className="block text-[12px] text-[#6b7280]">{item.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CanvasCard>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Contacts"
          value={data.totalContacts.toLocaleString()}
          delta={weekDelta}
          detail={`${data.newThisWeek} new this week`}
          icon={Users}
          tone="input"
          href="/contacts"
        />
        <StatTile
          label="Needs reply"
          value={data.needsReply.toLocaleString()}
          detail={`${data.openThreads} open conversations`}
          icon={Inbox}
          tone="content"
          href="/inbox"
        />
        <StatTile
          label="Messages · 7 days"
          value={(data.week.inbound + data.week.outbound).toLocaleString()}
          detail={`${data.week.inbound} in · ${data.week.outbound} out`}
          icon={MessagesSquare}
          tone="action"
          href="/inbox"
        />
        <StatTile
          label="Conversions · 30 days"
          value={data.conversions.toLocaleString()}
          detail={data.revenue ? `${data.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })} attributed to flows` : "Add a Goal step to a flow"}
          icon={Trophy}
          tone="start"
          href="/flows"
        />
        <StatTile
          label="Handled by automation"
          value={`${automatedShare}%`}
          detail={`${data.week.ai} AI replies · ${data.week.human} by your team`}
          icon={Bot}
          tone="action"
          href="/flows"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CanvasCard className="min-w-0 space-y-3 p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <p className="font-heading text-[15px] text-[#1b1f24]">New contacts</p>
            <p className="text-[12px] text-[#6b7280]">{data.newInPeriod.toLocaleString()} in the last 30 days</p>
          </div>
          <DailyColumns data={data.series} label="new contacts" />
        </CanvasCard>
        <CanvasCard className="min-w-0 space-y-3 p-4">
          <p className="font-heading text-[15px] text-[#1b1f24]">Where people come from</p>
          {data.platforms.length === 0 ? (
            <p className="text-[13px] text-[#6b7280]">No contacts yet.</p>
          ) : (
            <PlatformBars rows={data.platforms} fallbackLabel={bot.channel === "zernio" ? "Imported / other" : CHANNELS[bot.channel].label} />
          )}
        </CanvasCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CanvasCard className="min-w-0 space-y-2 p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-heading text-[15px] text-[#1b1f24]">Top flows · 30 days</p>
            <Link href="/flows" className="text-[12px] text-[#0084ff] hover:underline">
              All flows
            </Link>
          </div>
          {data.topFlows.length === 0 ? (
            <p className="py-4 text-[13px] text-[#6b7280]">
              No flow runs yet. Start from a{" "}
              <Link href="/flows" className="text-[#0084ff] hover:underline">
                template
              </Link>{" "}
              or{" "}
              <Link href="/ai" className="text-[#0084ff] hover:underline">
                build one with AI
              </Link>
              .
            </p>
          ) : (
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
                  <th className="py-1.5">Flow</th>
                  <th className="w-14 py-1.5 text-right">Runs</th>
                  <th className="w-14 py-1.5 text-right">CTR</th>
                  <th className="w-14 py-1.5 text-right">Done</th>
                </tr>
              </thead>
              <tbody>
                {data.topFlows.map((flow) => (
                  <tr key={flow.id} className="border-t border-[#f0f2f4]">
                    <td className="py-2">
                      <Link href={`/flows/${flow.id}`} className="flex min-w-0 items-center gap-2 text-[#1b1f24] hover:underline">
                        <Workflow className="size-3.5 shrink-0 text-[#0084ff]" />
                        <span className="truncate">{flow.name}</span>
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{flow.stats.runs}</td>
                    <td className="py-2 text-right tabular-nums">{flow.stats.clicks ? `${Math.round(flow.stats.ctr * 100)}%` : "—"}</td>
                    <td className="py-2 text-right tabular-nums">{Math.round(flow.stats.completionRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CanvasCard>

        <CanvasCard className="min-w-0 space-y-2 p-4">
          <div className="flex items-baseline justify-between">
            <p className="font-heading text-[15px] text-[#1b1f24]">Latest conversations</p>
            <Link href="/inbox" className="text-[12px] text-[#0084ff] hover:underline">
              Open inbox
            </Link>
          </div>
          {data.recentThreads.length === 0 ? (
            <p className="py-4 text-[13px] text-[#6b7280]">Nothing yet — conversations appear as people message or comment.</p>
          ) : (
            <ul>
              {data.recentThreads.map((thread) => (
                <li key={thread.contactId} className="border-t border-[#f0f2f4] first:border-0">
                  <Link href={`/inbox/${thread.contactId}`} className="flex items-center gap-2.5 py-2">
                    <ContactAvatar name={thread.name} src={thread.avatarUrl} platform={thread.platform} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#1b1f24]">{thread.name}</span>
                      <span className="block truncate text-[12px] text-[#6b7280]">
                        {thread.lastDirection === "outbound" ? "You: " : ""}
                        {thread.lastBody}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#8b95a1]">
                      {thread.needsReply ? <span className="size-2 rounded-full bg-[#0084ff]" /> : null}
                      {relative(thread.lastAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CanvasCard>
      </div>

      {team.humanReplies > 0 ? (
        <CanvasCard className="min-w-0 space-y-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-heading text-[15px] text-[#1b1f24]">Live Chat team · 30 days</p>
            <p className="text-[12px] text-[#6b7280]">
              Median first response <span className="font-medium text-[#1b1f24]">{formatDuration(team.medianResponseMs)}</span> ·{" "}
              {team.humanReplies.toLocaleString()} human / {team.automatedReplies.toLocaleString()} automated replies
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
                  <th className="py-1.5">Teammate</th>
                  <th className="py-1.5 text-right">Replies</th>
                  <th className="py-1.5 text-right">Conversations</th>
                  <th className="py-1.5 text-right">Median first response</th>
                </tr>
              </thead>
              <tbody>
                {team.agents.map((agent) => (
                  <tr key={agent.name} className="border-t border-[#f0f2f4]">
                    <td className="py-2 font-medium text-[#1b1f24]">{agent.name}</td>
                    <td className="py-2 text-right tabular-nums">{agent.replies}</td>
                    <td className="py-2 text-right tabular-nums">{agent.conversations}</td>
                    <td className="py-2 text-right tabular-nums">{formatDuration(agent.medianResponseMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CanvasCard>
      ) : null}
    </div>
  );
}
