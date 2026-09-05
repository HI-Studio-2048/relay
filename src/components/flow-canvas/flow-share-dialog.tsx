"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client";

export type FlowShareLink = {
  id: string;
  name: string;
  slug: string;
  flowId: string | null;
  clickCount: number;
  startCount: number;
  telegramUrl: string | null;
  shortUrl: string;
  qrUrl: string;
};

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`Copied ${label}`);
  } catch {
    toast.error("Could not copy");
  }
}

export function FlowShareButton({
  botId,
  flowId,
}: {
  botId?: string;
  flowId: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<FlowShareLink | null>(null);

  useEffect(() => {
    if (!open || !botId) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void api<{ link: FlowShareLink }>(`/api/growth-links`, {
      method: "POST",
      body: JSON.stringify({ botId, flowId, ensure: true }),
    })
      .then((data) => {
        if (!cancelled) setLink(data.link);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load share link");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, botId, flowId]);

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={!botId}
        onClick={() => setOpen(true)}
        title={botId ? "Copy this flow’s start link" : "Connect a bot before sharing"}
      >
        <Share2 data-icon="inline-start" />
        Share
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Share this flow</DialogTitle>
            <DialogDescription>
              One Growth Link is bound to this flow. Opening it in Telegram starts this canvas.
            </DialogDescription>
          </DialogHeader>
          {!botId ? (
            <p className="text-sm text-muted-foreground">Connect a bot in Settings before sharing.</p>
          ) : busy && !link ? (
            <p className="text-sm text-muted-foreground">Loading share link…</p>
          ) : error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{error}</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  setTimeout(() => setOpen(true), 0);
                }}
              >
                Try again
              </Button>
            </div>
          ) : link ? (
            <div className="space-y-3">
              <ShareField
                label="Telegram"
                value={link.telegramUrl ?? ""}
                empty="Connect the bot to get a t.me link."
                copyLabel="Telegram link"
              />
              <ShareField label="Short URL" value={link.shortUrl} copyLabel="short link" />
              <div className="flex items-end gap-3">
                {/* QR of the short URL — same qrserver helper as Growth admin. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={link.qrUrl}
                  alt={`QR for /start ${link.slug}`}
                  width={180}
                  height={180}
                  className="rounded-xl bg-white p-1 ring-1 ring-border"
                />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  /start {link.slug}
                  <br />
                  {link.clickCount} click{link.clickCount === 1 ? "" : "s"} · {link.startCount} start
                  {link.startCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShareField({
  label,
  value,
  empty,
  copyLabel,
}: {
  label: string;
  value: string;
  empty?: string;
  copyLabel: string;
}) {
  if (!value) {
    return (
      <div className="space-y-1">
        <Label>{label}</Label>
        <p className="text-[11px] text-muted-foreground">{empty}</p>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} onFocus={(event) => event.currentTarget.select()} />
        <Button type="button" size="sm" variant="outline" onClick={() => void copyText(value, copyLabel)}>
          Copy
        </Button>
      </div>
    </div>
  );
}
