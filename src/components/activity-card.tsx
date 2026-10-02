"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client";

type Row = { id: string; actor: string | null; action: string; detail: string | null; createdAt: string };

function ago(date: Date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return date.toISOString().slice(0, 10);
}

/** Settings → Activity: the latest admin actions, newest first. */
export function ActivityCard({ botId }: { botId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ activity: Row[] }>(`/api/bots/${botId}/activity`)
      .then((data) => !cancelled && setRows(data.activity))
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [botId]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>Who sent, published, erased or merged what. Pick who you are in Team so it shows your name.</CardDescription>
      </CardHeader>
      <CardContent>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. Sends, flow changes, erasures and key changes show up here.</p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium">{row.actor ?? "Admin"}</span> {row.action.charAt(0).toLowerCase() + row.action.slice(1)}
                  {row.detail ? <span className="break-words text-muted-foreground"> · {row.detail}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{ago(new Date(row.createdAt))}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
