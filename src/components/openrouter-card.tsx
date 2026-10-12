"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

export type OpenRouterStatus = { connected: boolean; model: string; hint: string };

/** Bring your own OpenRouter key: this account's AI runs on it, billed to the owner's OpenRouter account. */
export function OpenRouterCard({ botId, initial }: { botId: string; initial: OpenRouterStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [busy, setBusy] = useState(false);

  const call = async (method: "PUT" | "DELETE", body?: object) => {
    setBusy(true);
    try {
      const next = await api<OpenRouterStatus>(`/api/bots/${botId}/openrouter`, { method, body: body ? JSON.stringify(body) : undefined });
      setStatus(next);
      setModel(next.model);
      setApiKey("");
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (await call("PUT", { apiKey, model })) toast.success(apiKey ? "OpenRouter connected" : "Model saved");
  };
  const remove = async () => {
    if (await call("DELETE")) toast.success("OpenRouter key removed");
  };

  return (
    <Panel tone="input" icon={KeyRound} label="Your AI key" title={status.connected ? "Running on your OpenRouter key" : "Use your own OpenRouter key"}>
      <p className="text-[13px] text-[#6b7280]">
        Replies, AI Steps, flow drafts and everything else on the AI page run on your OpenRouter account, with whichever model you pick. You
        pay OpenRouter for the usage. Get a key at openrouter.ai/keys.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={status.connected ? `Saved key ending in ${status.hint}. Paste a new one to replace it` : "sk-or-v1-..."}
          aria-label="OpenRouter API key"
        />
        <Input
          value={model}
          onChange={(event) => setModel(event.target.value)}
          placeholder="openai/gpt-4o-mini"
          aria-label="OpenRouter model"
        />
      </div>
      <p className="text-[12px] text-[#6b7280]">
        Model is any id from openrouter.ai/models, for example anthropic/claude-sonnet-4.5 or openai/gpt-4o-mini. Pick one that supports
        structured output for the most reliable results.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={busy || (!apiKey.trim() && !status.connected)}>
          {busy ? "Checking…" : status.connected && !apiKey.trim() ? "Save model" : "Connect"}
        </Button>
        {status.connected ? (
          <Button variant="outline" onClick={() => void remove()} disabled={busy}>
            Remove key
          </Button>
        ) : null}
      </div>
    </Panel>
  );
}
