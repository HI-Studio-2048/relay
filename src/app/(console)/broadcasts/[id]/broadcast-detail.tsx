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
          <p className="whitespace-pre-wrap text-sm">{broadcast.body}</p>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            {broadcast.sentCount}/{broadcast.totalCount} sent · {broadcast.failedCount} failed
          </p>
        </CardFooter>
      </Card>
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
