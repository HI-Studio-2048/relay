"use client";

import { useRouter } from "next/navigation";
import { useBot } from "@/components/bot-provider";
import { Button } from "@/components/ui/button";
import { CHANNELS, type ChannelId } from "@/lib/channels/types";
import { cn } from "@/lib/utils";

export type AccountRow = {
  id: string;
  name: string;
  channel: string;
  status: string;
  contacts: number;
  newThisWeek: number;
  needsReply: number;
  activeFlows: number;
  totalFlows: number;
  conversions: number;
  /** Formatted per currency, e.g. "¥5,000 · $19.99"; empty when none. */
  revenue: string;
};

export function AccountsTable({ rows }: { rows: AccountRow[] }) {
  const { botId, setBotId } = useBot();
  const router = useRouter();
  const open = (id: string, path: string) => {
    if (id !== botId) setBotId(id);
    router.push(path);
  };
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-[0_1px_3px_rgba(16,24,40,0.10)] ring-1 ring-[#e5e7eb]">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-[#e5e7eb] text-left text-[11px] font-semibold tracking-wide text-[#8b95a1] uppercase">
            <th className="px-4 py-2.5">Account</th>
            <th className="px-3 py-2.5 text-right">Contacts</th>
            <th className="px-3 py-2.5 text-right">New · 7d</th>
            <th className="px-3 py-2.5 text-right">Needs reply</th>
            <th className="px-3 py-2.5 text-right">Flows on</th>
            <th className="px-3 py-2.5 text-right">Goals · 30d</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={cn("border-b border-[#f0f2f4] last:border-0", row.id === botId && "bg-[#f7fbff]")}>
              <td className="px-4 py-2.5">
                <p className="font-medium text-[#1b1f24]">
                  {row.name}
                  {row.id === botId ? <span className="ml-2 rounded-full bg-[#eef6ff] px-1.5 py-0.5 text-[10px] font-medium text-[#0b63c5]">Current</span> : null}
                </p>
                <p className="text-[12px] text-[#6b7280]">
                  {CHANNELS[row.channel as ChannelId]?.label ?? row.channel} · {row.status}
                </p>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.contacts.toLocaleString()}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{row.newThisWeek.toLocaleString()}</td>
              <td className={cn("px-3 py-2.5 text-right tabular-nums", row.needsReply > 0 && "font-semibold text-[#0084ff]")}>{row.needsReply}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {row.activeFlows}/{row.totalFlows}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {row.conversions}
                {row.revenue ? <span className="block text-[11px] text-[#6b7280]">{row.revenue}</span> : null}
              </td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex justify-end gap-1.5">
                  {row.needsReply > 0 ? (
                    <Button size="xs" variant="outline" onClick={() => open(row.id, "/inbox")}>
                      Inbox
                    </Button>
                  ) : null}
                  <Button size="xs" onClick={() => open(row.id, "/")}>
                    Open
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
