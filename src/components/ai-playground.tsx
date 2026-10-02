"use client";

import { useState } from "react";
import { FlaskConical, Send } from "lucide-react";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import type { BotAiSettings, HistoryLine } from "@/lib/ai";
import { cn } from "@/lib/utils";

/** Try the assistant as a customer, with the persona and knowledge currently on the page. */
export function AiPlayground({ botId, settings }: { botId: string; settings: BotAiSettings }) {
  const [history, setHistory] = useState<(HistoryLine & { handoff?: boolean })[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const next = [...history, { direction: "inbound" as const, body: text }];
    setHistory(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ reply: string; handoff: boolean }>(`/api/bots/${botId}/ai-test`, {
        method: "POST",
        body: JSON.stringify({ settings, history: next.map(({ direction, body }) => ({ direction, body })) }),
      });
      setHistory([...next, { direction: "outbound", body: data.reply || "(no reply)", handoff: data.handoff }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "AI is unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel tone="input" icon={FlaskConical} label="Playground" title="Chat with your assistant before it talks to customers">
      <div className="max-h-72 min-h-24 space-y-2 overflow-y-auto rounded-xl bg-[#f4f6f8] p-3">
        {history.length === 0 ? (
          <p className="text-[13px] text-[#6b7280]">Ask what a customer would: prices, hours, refunds… It uses the persona and knowledge above, even unsaved.</p>
        ) : (
          history.map((line, index) => (
            <div key={index} className={cn("flex", line.direction === "inbound" ? "justify-end" : "justify-start")}>
              <p
                className={cn(
                  "max-w-[80%] rounded-2xl px-3 py-1.5 text-[13px] whitespace-pre-wrap",
                  line.direction === "inbound" ? "rounded-br-md bg-[#0084ff] text-white" : "rounded-bl-md bg-white text-[#1b1f24] ring-1 ring-[#e5e7eb]",
                )}
              >
                {line.body}
                {line.handoff ? <span className="mt-1 block text-[11px] text-amber-700">→ would hand off to a human</span> : null}
              </p>
            </div>
          ))
        )}
        {busy ? <p className="text-[12px] text-[#8b95a1]">Thinking…</p> : null}
      </div>
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void send();
          }}
          placeholder="Type as a customer…"
          className="h-9 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] outline-none focus:border-[#0084ff]"
        />
        <Button size="sm" disabled={busy || !draft.trim()} onClick={() => void send()} aria-label="Send">
          <Send className="size-3.5" />
        </Button>
        {history.length ? (
          <Button size="sm" variant="ghost" onClick={() => setHistory([])}>
            Reset
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
