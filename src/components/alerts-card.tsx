"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

/** Where team alerts go: AI hand-offs, Notify admin steps, rule alerts. */
export function AlertsCard({ botId }: { botId: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ alerts: { webhookUrl: string } }>(`/api/bots/${botId}/alerts`)
      .then((data) => {
        if (!cancelled) setUrl(data.alerts.webhookUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [botId]);

  const save = async (test: boolean) => {
    setBusy(true);
    try {
      await api(`/api/bots/${botId}/alerts`, { method: "PUT", body: JSON.stringify({ webhookUrl: url }) });
      if (test) {
        await api(`/api/bots/${botId}/alerts`, { method: "POST" });
        toast.success("Test alert sent");
      } else toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel tone="action" icon={Bell} label="Team alerts" title="Get pinged in Slack, Discord or Teams">
      <p className="text-[13px] text-[#6b7280]">
        AI hand-offs, “Notify admin” steps and rule alerts post here, with a link to the conversation. Paste an incoming webhook URL.
      </p>
      <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.slack.com/services/…" />
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save(false)}>
          Save
        </Button>
        <Button size="sm" variant="outline" disabled={busy || !url.trim()} onClick={() => void save(true)}>
          Save and send a test
        </Button>
      </div>
    </Panel>
  );
}
