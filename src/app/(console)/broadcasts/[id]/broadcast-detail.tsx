"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type BroadcastView = {
  id: string;
  name: string;
  body: string;
  status: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  lastError: string | null;
  scheduledAt?: string | null;
  /** Human summary of the segment conditions, if any. */
  segment?: string | null;
  isFlow?: boolean;
  smartTiming?: boolean;
  bodyB?: string | null;
  variants?: { variant: string; sent: number; replied: number }[];
  /** Smart timing: recipients still waiting for their usual hour. */
  waitingCount?: number;
  nextAt?: string | null;
};

export function BroadcastDetail({
  initialBroadcast,
  notice,
}: {
  initialBroadcast: BroadcastView;
  notice?: "queued" | "CONFIRM_REQUIRED" | "empty" | "missing" | "INVALID_STATUS" | string;
}) {
  const broadcast = initialBroadcast;
  const canConfirm = broadcast.status === "draft" || broadcast.status === "awaiting_confirm";
  const [when, setWhen] = useState("");
  const scheduledIso = when ? new Date(when).toISOString() : "";

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-heading text-3xl tracking-tight">{broadcast.name}</h1>
        <p className="text-sm text-muted-foreground">Status: {broadcast.status}</p>
      </div>
      {notice === "queued" ? (
        <p className="text-sm text-muted-foreground">Broadcast queued. Sends are rate-limited per account.</p>
      ) : null}
      {broadcast.status === "scheduled" && broadcast.scheduledAt ? (
        <p className="rounded-lg bg-[#eef6ff] px-3 py-2 text-sm text-[#0b63c5]">
          Scheduled for {new Date(broadcast.scheduledAt).toLocaleString()}. The audience is worked out when it sends.
        </p>
      ) : null}
      {broadcast.smartTiming ? (
        <p className="rounded-lg bg-[#f5f3ff] px-3 py-2 text-sm text-[#5b21b6]">
          Smart send time is on: each person gets it at the hour they usually message, within 24 hours.
          {broadcast.waitingCount
            ? ` ${broadcast.waitingCount} waiting for their hour${broadcast.nextAt ? ` (next at ${new Date(broadcast.nextAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""}.`
            : ""}
        </p>
      ) : null}
      {broadcast.segment ? (
        <p className="text-sm text-muted-foreground">Audience conditions: {broadcast.segment}</p>
      ) : null}
      {notice === "CONFIRM_REQUIRED" ? (
        <p className="text-sm text-destructive">Type CONFIRM exactly, then submit. Nothing was sent.</p>
      ) : null}
      {notice && notice !== "queued" && notice !== "scheduled" && notice !== "CONFIRM_REQUIRED" ? (
        <p className="text-sm text-destructive">Could not send ({notice}).</p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{broadcast.isFlow ? "Flow" : "Copy"}</CardTitle>
          <CardDescription>
            {broadcast.isFlow ? "Each recipient starts this flow from the top." : "This is the exact message that will be sent."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {broadcast.bodyB ? <p className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Version A</p> : null}
          <p className="whitespace-pre-wrap text-sm">{broadcast.body}</p>
          {broadcast.bodyB ? (
            <>
              <p className="mt-3 mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Version B</p>
              <p className="whitespace-pre-wrap text-sm">{broadcast.bodyB}</p>
            </>
          ) : null}
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            {broadcast.sentCount}/{broadcast.totalCount} sent · {broadcast.failedCount} failed
          </p>
        </CardFooter>
      </Card>
      {broadcast.bodyB && (broadcast.variants ?? []).some((row) => row.sent > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle>A/B test</CardTitle>
            <CardDescription>Half the audience got each version. Reply rate counts replies within 48 hours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(() => {
              const rows = ["a", "b"].map((variant) => {
                const row = broadcast.variants?.find((item) => item.variant === variant) ?? { variant, sent: 0, replied: 0 };
                return { ...row, rate: row.sent ? row.replied / row.sent : 0 };
              });
              const leader = rows[0]!.rate === rows[1]!.rate ? null : rows[0]!.rate > rows[1]!.rate ? "a" : "b";
              return rows.map((row) => (
                <div key={row.variant} className="flex items-center gap-3 text-sm">
                  <span className="w-20 font-medium">Version {row.variant.toUpperCase()}</span>
                  <div className="h-2 flex-1 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[#00c853]" style={{ width: `${Math.round(row.rate * 100)}%` }} />
                  </div>
                  <span className="w-40 text-right tabular-nums text-muted-foreground">
                    {Math.round(row.rate * 100)}% · {row.replied}/{row.sent} replied
                  </span>
                  {leader === row.variant ? <span className="rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[11px] font-medium text-[#05603a]">Leading</span> : <span className="w-[58px]" />}
                </div>
              ));
            })()}
          </CardContent>
        </Card>
      ) : null}
      {broadcast.lastError ? (
        <p className="text-sm text-destructive">{broadcast.lastError}</p>
      ) : null}

      {canConfirm ? (
        <Card>
          <CardHeader>
            <CardTitle>Confirm before send</CardTitle>
            <CardDescription>
              This will send to {broadcast.totalCount} contact
              {broadcast.totalCount === 1 ? "" : "s"}. Type CONFIRM. Leave the time empty to send now, or pick
              a time to schedule it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              method="POST"
              action={`/api/broadcasts/${broadcast.id}/confirm`}
              className="space-y-3"
            >
              <div className="space-y-1">
                <Label htmlFor="confirm-phrase">Type CONFIRM</Label>
                <input
                  id="confirm-phrase"
                  name="phrase"
                  placeholder="CONFIRM"
                  autoComplete="off"
                  required
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="schedule-at">Schedule (optional)</Label>
                <input
                  id="schedule-at"
                  type="datetime-local"
                  value={when}
                  onChange={(event) => setWhen(event.target.value)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                />
                <input type="hidden" name="scheduledAt" value={scheduledIso} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="smartTiming" className="mt-1" />
                <span>
                  <span className="font-medium">Smart send time</span>
                  <span className="block text-muted-foreground">
                    Deliver to each person at the hour they usually message, within 24 hours of the send. People with no
                    history get it right away.
                  </span>
                </span>
              </label>
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "destructive" }))}
              >
                {when ? "Schedule" : "Send now"}
              </button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
