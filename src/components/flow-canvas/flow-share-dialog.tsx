"use client";

import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { GrowthLinkShareActions } from "@/components/chrome/growth-link-share";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/client";
import type { GrowthLinkView } from "@/lib/growth";

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
  const [link, setLink] = useState<GrowthLinkView | null>(null);

  useEffect(() => {
    if (!open || !botId) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    void api<{ link: GrowthLinkView }>(`/api/growth-links`, {
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
              One Growth Link is bound to this flow. Copy the t.me start link, short /go URL, or scan the QR.
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
            <div className="rounded-xl border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium">{link.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                /start {link.slug} · {link.clickCount} click{link.clickCount === 1 ? "" : "s"} · {link.startCount}{" "}
                start{link.startCount === 1 ? "" : "s"}
              </p>
              <GrowthLinkShareActions link={link} />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
