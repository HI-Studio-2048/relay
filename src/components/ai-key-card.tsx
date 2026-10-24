"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AI_VENDORS, vendorInfo, type AiKeyStatus, type AiVendor, type AiVendorInfo } from "@/lib/ai-vendors";
import { api } from "@/lib/client";

const SELECT =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** "Anthropic" for "Anthropic (Claude)". */
function shortName(info: AiVendorInfo) {
  return info.label.replace(/ \(.*\)$/, "");
}

/**
 * Bring your own AI key: this account's AI runs on the owner's own account with Anthropic, OpenAI,
 * Google, xAI, Mistral, Groq, DeepSeek or OpenRouter, billed by that provider.
 */
export function AiKeyCard({ botId, initial }: { botId: string; initial: AiKeyStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [provider, setProvider] = useState<AiVendor>(initial.provider);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(initial.model);
  const [busy, setBusy] = useState(false);
  const info = vendorInfo(provider);
  const saved = vendorInfo(status.provider);
  const savedHere = status.connected && status.provider === provider;

  const chooseProvider = (next: AiVendor) => {
    setProvider(next);
    setModel(status.connected && status.provider === next ? status.model : vendorInfo(next).defaultModel);
  };

  const call = async (method: "PUT" | "DELETE", body?: object) => {
    setBusy(true);
    try {
      const next = await api<AiKeyStatus>(`/api/bots/${botId}/ai-key`, { method, body: body ? JSON.stringify(body) : undefined });
      setStatus(next);
      setProvider(next.provider);
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
    const key = apiKey.trim();
    if (await call("PUT", { provider, apiKey: key, model })) toast.success(key ? `${shortName(info)} connected` : "Model saved");
  };
  const remove = async () => {
    if (await call("DELETE")) toast.success("Key removed");
  };

  return (
    <Panel tone="input" icon={KeyRound} label="Your AI key" title={status.connected ? `Running on your ${shortName(saved)} key` : "Use your own AI key"}>
      <p className="text-[13px] text-[#6b7280]">
        Replies, AI Steps, flow drafts, the Overview assistant and everything else on this page run on your own account, with the provider and model
        you pick. You pay them for the usage. Anthropic (Claude), OpenAI, Google Gemini, xAI (Grok), Mistral, Groq, DeepSeek and OpenRouter all work.
      </p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)]">
        <select value={provider} onChange={(event) => chooseProvider(event.target.value as AiVendor)} aria-label="AI provider" className={SELECT}>
          {AI_VENDORS.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.label}
            </option>
          ))}
        </select>
        <Input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={savedHere ? `Saved key ending in ${status.hint}. Paste a new one to replace it` : info.keyPlaceholder}
          aria-label={`${shortName(info)} API key`}
        />
        {info.anyModel ? (
          <>
            <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder={info.defaultModel} aria-label="Model" list={`ai-key-models-${provider}`} />
            <datalist id={`ai-key-models-${provider}`}>
              {info.models.map((item) => (
                <option key={item.id} value={item.id} />
              ))}
            </datalist>
          </>
        ) : (
          <select value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model" className={SELECT}>
            {info.models.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-[12px] text-[#6b7280]">
        Get a key at{" "}
        <a href={info.keysUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-[#0084ff] hover:underline">
          {info.keysUrl.replace(/^https:\/\//, "")}
        </a>
        .{info.anyModel ? " Type any model id, or pick a suggestion. One that supports tool calls and structured output works best." : ""}
        {status.connected && !savedHere ? ` Connecting ${shortName(info)} replaces your ${shortName(saved)} key.` : ""}
      </p>
      <div className="flex gap-2">
        <Button onClick={() => void save()} disabled={busy || (!apiKey.trim() && !savedHere)}>
          {busy ? "Checking…" : savedHere && !apiKey.trim() ? "Save model" : "Connect"}
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
