import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Bot, Inbox, LayoutDashboard, MessagesSquare, TriangleAlert, Trophy, Users, Workflow } from "lucide-react";
import { DailyColumns, PlatformBars } from "@/components/charts";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { ChannelSwitcher } from "@/components/channel-switcher";
import { ContactAvatar } from "@/components/chrome/avatar";
import { PageHeader } from "@/components/chrome/page-header";
import { Panel } from "@/components/chrome/panel";
import { ChannelBadge } from "@/components/chrome/platform-badge";
import { CanvasCard, ToneChip, type ToneName } from "@/components/chrome/tone";
import { CHANNELS, channelOf } from "@/lib/channels/types";
import type { WorkspaceOverview } from "@/lib/dashboard";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

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

type BotSummary = { id: string; name: string; channel: string; status: string; lastHealthError: string | null };

export function OverviewAggregate({ bots, overview }: { bots: BotSummary[]; overview: WorkspaceOverview }) {
  const data = overview.totals;
  const weekDelta = data.newPreviousWeek > 0 ? Math.round(((data.newThisWeek - data.newPreviousWeek) / data.newPreviousWeek) * 100) : null;
  const automatedShare = data.week.outbound ? Math.round((data.week.automated / data.week.outbound) * 100) : 0;
  const attention = bots.filter((bot) => bot.lastHealthError);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workspace"
        icon={LayoutDashboard}
        tone="start"
        title="Overview"
        description={`All channels · ${bots.length} connected`}
        actions={<ChannelSwitcher />}
      />

      {attention.length > 0 ? (
        <Panel tone="stop" icon={TriangleAlert} label="Needs attention" description={attention.map((bot) => `${bot.name}: ${bot.lastHealthError}`).join(" ")}>
          <span />
        </Panel>
      ) : null}

      <AssistantPanel />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Contacts" value={data.totalContacts.toLocaleString()} delta={weekDelta} detail={`${data.newThisWeek} new this week`} icon={Users} tone="input" href="/contacts" />
        <StatTile label="Needs reply" value={data.needsReply.toLocaleString()} detail={`${data.openThreads} open conversations`} icon={Inbox} tone="content" href="/inbox" />
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
          detail={data.revenue ? `${data.revenue} in revenue` : "Add a Goal step to a flow"}
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

      <CanvasCard className="min-w-0 space-y-2 p-4">
        <p className="font-heading text-[15px] text-[#1b1f24]">By channel</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
                <th className="py-1.5">Channel</th>
                <th className="py-1.5 text-right">Contacts</th>
                <th className="py-1.5 text-right">New</th>
                <th className="py-1.5 text-right">Needs reply</th>
                <th className="py-1.5 text-right">Messages · 7d</th>
                <th className="py-1.5 text-right">Conversions</th>
              </tr>
            </thead>
            <tbody>
              {overview.channels.map((channel) => {
                const meta = CHANNELS[channelOf(channel.channel)];
                return (
                  <tr key={channel.botId} className="border-t border-[#f0f2f4]">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: meta.color }} />
                        <span className="font-medium text-[#1b1f24]">{channel.name}</span>
                        <span className="text-[#6b7280]">{meta.label}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{channel.totalContacts.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{channel.newThisWeek.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{channel.needsReply.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{channel.messages.toLocaleString()}</td>
                    <td className="py-2 text-right tabular-nums">{channel.conversions.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CanvasCard>

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
          {data.platforms.length === 0 ? <p className="text-[13px] text-[#6b7280]">No contacts yet.</p> : <PlatformBars rows={data.platforms} fallbackLabel="Direct" />}
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
            <p className="py-4 text-[13px] text-[#6b7280]">No flow runs yet.</p>
          ) : (
            <table className="w-full table-fixed text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
                  <th className="py-1.5">Flow</th>
                  <th className="w-14 py-1.5 text-right">Runs</th>
                  <th className="w-14 py-1.5 text-right">Done</th>
                </tr>
              </thead>
              <tbody>
                {data.topFlows.map((flow) => (
                  <tr key={flow.id} className="border-t border-[#f0f2f4]">
                    <td className="py-2">
                      <Link href={`/flows/${flow.id}`} className={cn("flex min-w-0 items-center gap-2 text-[#1b1f24] hover:underline")}>
                        <Workflow className="size-3.5 shrink-0 text-[#0084ff]" />
                        <span className="truncate">
                          {flow.name}
                          {"botName" in flow && flow.botName ? <span className="text-[#6b7280]"> · {String(flow.botName)}</span> : null}
                        </span>
                      </Link>
                    </td>
                    <td className="py-2 text-right tabular-nums">{flow.stats.runs}</td>
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
            <p className="py-4 text-[13px] text-[#6b7280]">Nothing yet. Conversations show up here once people message or comment.</p>
          ) : (
            <ul>
              {data.recentThreads.map((thread) => (
                <li key={thread.contactId} className="border-t border-[#f0f2f4] first:border-0">
                  <Link href={`/inbox/${thread.contactId}`} className="flex items-center gap-2.5 py-2">
                    <ContactAvatar name={thread.name} src={thread.avatarUrl} platform={thread.platform} className="size-8" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-[#1b1f24]">{thread.name}</span>
                        <ChannelBadge channel={thread.channel} name={thread.botName} />
                      </span>
                      <span className="block truncate text-[12px] text-[#6b7280]">
                        {thread.lastDirection === "outbound" ? "You: " : ""}
                        {thread.lastBody}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[#8b95a1]">{relative(thread.lastAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
