"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useBot } from "@/components/bot-provider";
import { api } from "@/lib/client";

const STYLES = [
  { value: "shorter", label: "Shorter" },
  { value: "friendlier", label: "Friendlier" },
  { value: "persuasive", label: "More persuasive" },
  { value: "emoji", label: "Add emoji" },
  { value: "fix", label: "Fix grammar" },
] as const;

/** "✨ Rewrite" for message copy in the flow editor, with one-step undo. */
export function AiRewrite({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  const { botId } = useBot();
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState<string | null>(null);

  const run = async (style: string) => {
    if (!botId || !text.trim()) return;
    setBusy(true);
    try {
      const data = await api<{ text: string }>("/api/flows/rewrite", { method: "POST", body: JSON.stringify({ botId, text, style }) });
      setPrevious(text);
      onChange(data.text);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI is unavailable");
    } finally {
      setBusy(false);
    }
  };

  if (!text.trim()) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Sparkles className={`size-3 text-[#d946ef] ${busy ? "animate-pulse" : ""}`} />
      {STYLES.map((style) => (
        <button
          key={style.value}
          type="button"
          disabled={busy}
          onClick={() => void run(style.value)}
          className="rounded-full bg-[#fdf4ff] px-2 py-0.5 text-[11px] text-[#a21caf] ring-1 ring-[#f0abfc] hover:bg-[#fae8ff] disabled:opacity-50"
        >
          {style.label}
        </button>
      ))}
      {previous !== null ? (
        <button
          type="button"
          className="text-[11px] text-[#0084ff] hover:underline"
          onClick={() => {
            onChange(previous);
            setPrevious(null);
          }}
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}
