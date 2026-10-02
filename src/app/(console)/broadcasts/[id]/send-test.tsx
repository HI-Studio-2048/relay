"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useBot } from "@/components/bot-provider";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

/** "Send a test" to one contact (search by name, @handle or email) before confirming. */
export function SendTest({ broadcastId }: { broadcastId: string }) {
  const { botId } = useBot();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ id: string; name: string; detail: string }[]>([]);
  const [contactId, setContactId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!botId || query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ contacts: { id: string; name: string; detail: string }[] }>(`/api/search?botId=${botId}&q=${encodeURIComponent(query)}`)
        .then((data) => {
          if (cancelled) return;
          setMatches(data.contacts);
          setContactId((current) => current || data.contacts[0]?.id || "");
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, botId]);

  const send = async () => {
    setBusy(true);
    try {
      const data = await api<{ sent: number }>(`/api/broadcasts/${broadcastId}/test`, { method: "POST", body: JSON.stringify({ contactId }) });
      toast.success(data.sent > 1 ? "Both versions sent as a test" : "Test sent");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the test");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg bg-muted/50 p-3">
      <p className="text-sm font-medium">Send a test first</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setContactId("");
          }}
          placeholder="Find yourself or a teammate: name, @handle, email"
          className="h-8 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm"
        />
        {matches.length > 0 ? (
          <select
            aria-label="Test recipient"
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          >
            {matches.map((match) => (
              <option key={match.id} value={match.id}>
                {match.name} {match.detail ? `· ${match.detail}` : ""}
              </option>
            ))}
          </select>
        ) : null}
        <Button type="button" size="sm" variant="outline" disabled={busy || !contactId} onClick={() => void send()}>
          {busy ? "Sending…" : "Send test"}
        </Button>
      </div>
    </div>
  );
}
