"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

type ApiKey = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type Subscription = {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  lastStatus: number | null;
  lastError: string | null;
  lastDeliveredAt: string | null;
};

/** Mirrors WEBHOOK_EVENTS in lib/developer.ts (kept here so the page stays browser-only). */
const EVENTS = [
  { value: "contact.created", label: "New contact" },
  { value: "message.received", label: "Message or comment received" },
  { value: "contact.tag_added", label: "Tag added" },
  { value: "contact.tag_removed", label: "Tag removed" },
  { value: "contact.field_set", label: "Field set (incl. email / phone)" },
  { value: "contact.subscribed", label: "Subscribed to a list" },
  { value: "flow.completed", label: "Flow completed" },
  { value: "conversation.handoff", label: "AI handed off to a human" },
];

const copy = (text: string) => {
  void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
};

export function IntegrationsClient({ botId, origin }: { botId: string; origin: string }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<Subscription[]>([]);
  const [keyName, setKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["contact.created", "contact.field_set"]);

  const load = async () => {
    const [keyData, hookData] = await Promise.all([
      api<{ keys: ApiKey[] }>(`/api/developer/keys?botId=${botId}`),
      api<{ webhooks: Subscription[] }>(`/api/developer/webhooks?botId=${botId}`),
    ]);
    setKeys(keyData.keys);
    setHooks(hookData.webhooks);
  };

  useEffect(() => {
    const timer = setTimeout(() => void load().catch(() => undefined), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the account changes
  }, [botId]);

  const createKey = async () => {
    try {
      const data = await api<{ key: string }>("/api/developer/keys", { method: "POST", body: JSON.stringify({ botId, name: keyName }) });
      setFreshKey(data.key);
      setKeyName("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create key");
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("Revoke this key? Anything using it stops working immediately.")) return;
    await api(`/api/developer/keys/${id}`, { method: "DELETE" });
    await load();
  };

  const addHook = async () => {
    try {
      await api("/api/developer/webhooks", { method: "POST", body: JSON.stringify({ botId, url, events }) });
      setUrl("");
      toast.success("Webhook added");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add webhook");
    }
  };

  const test = async (id: string) => {
    const data = await api<{ ok: boolean; status: number | null; error: string | null }>(`/api/developer/webhooks/${id}/test`, { method: "POST" });
    if (data.ok) toast.success(`Delivered (HTTP ${data.status})`);
    else toast.error(`Failed: ${data.error}`);
    await load();
  };

  const base = `${origin || "https://your-relay"}/api/v1`;

  return (
    <div className="space-y-5">
      <Panel tone="action" icon={KeyRound} label="API keys" title="Authenticate with Authorization: Bearer rly_…">
        {freshKey ? (
          <div className="space-y-1 rounded-lg bg-[#ecfdf3] p-3 text-[13px]">
            <p className="font-medium text-[#05603a]">Copy this key now — it will not be shown again.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1 font-mono text-[12px]">{freshKey}</code>
              <Button size="sm" variant="outline" onClick={() => copy(freshKey)}>
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Input value={keyName} onChange={(event) => setKeyName(event.target.value)} placeholder="Key name (e.g. Zapier)" />
          <Button onClick={() => void createKey()}>Create key</Button>
        </div>
        {keys.length ? (
          <ul className="divide-y divide-[#f0f2f4] text-[13px]">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium text-[#1b1f24]">{key.name}</span>{" "}
                  <code className="text-[12px] text-[#6b7280]">{key.prefix}…</code>
                  <span className="block text-[11px] text-[#8b95a1]">
                    {key.lastUsedAt ? `Last used ${new Date(key.lastUsedAt).toLocaleString()}` : "Never used"}
                  </span>
                </span>
                <Button size="sm" variant="ghost" aria-label={`Revoke ${key.name}`} onClick={() => void revoke(key.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <details className="text-[12px] text-[#6b7280]">
          <summary className="cursor-pointer font-medium text-[#1b1f24]">Endpoints</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0f172a] p-3 text-[11px] leading-relaxed text-[#e2e8f0]">{`GET    ${base}/me
GET    ${base}/contacts?email=&phone=&tag=&q=&limit=
GET    ${base}/contacts/:id
PATCH  ${base}/contacts/:id   { first_name, email, phone, fields: {}, add_tags: [], remove_tags: [] }
POST   ${base}/contacts/:id/flows     { flow_id }
POST   ${base}/contacts/:id/messages  { text }
GET    ${base}/flows
GET    ${base}/tags

curl -H "Authorization: Bearer rly_…" ${base}/contacts?tag=lead`}</pre>
        </details>
      </Panel>

      <Panel tone="content" icon={Webhook} label="Webhooks" title="POST signed JSON to your URL when things happen">
        <div className="space-y-2">
          <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://hooks.zapier.com/…" />
          <div className="flex flex-wrap gap-1.5">
            {EVENTS.map((event) => {
              const on = events.includes(event.value);
              return (
                <button
                  key={event.value}
                  type="button"
                  onClick={() => setEvents((current) => (on ? current.filter((item) => item !== event.value) : [...current, event.value]))}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[12px] ring-1",
                    on ? "bg-[#eef6ff] text-[#0b63c5] ring-[#0084ff]" : "bg-white text-[#6b7280] ring-[#e5e7eb]",
                  )}
                >
                  {event.label}
                </button>
              );
            })}
          </div>
          <Button onClick={() => void addHook()} disabled={!url.trim() || events.length === 0}>
            Add webhook
          </Button>
        </div>
        {hooks.map((hook) => (
          <div key={hook.id} className="space-y-1.5 rounded-xl p-3 ring-1 ring-[#e5e7eb]">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[13px] font-medium text-[#1b1f24]">{hook.url}</p>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                  hook.lastError ? "bg-red-50 text-red-700" : hook.lastStatus ? "bg-[#ecfdf3] text-[#05603a]" : "bg-[#f4f6f8] text-[#6b7280]",
                )}
              >
                {hook.lastError ? `Failing · ${hook.lastError}` : hook.lastStatus ? `OK · ${hook.lastStatus}` : "No deliveries yet"}
              </span>
            </div>
            <p className="text-[12px] text-[#6b7280]">{hook.events.join(", ")}</p>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-[#6b7280]">Signing secret</span>
              <code className="rounded bg-[#f4f6f8] px-1.5 py-0.5 font-mono">{hook.secret.slice(0, 6)}…</code>
              <button type="button" className="text-[#0084ff] hover:underline" onClick={() => copy(hook.secret)}>
                copy
              </button>
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => void test(hook.id)}>
                  Send test
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void api(`/api/developer/webhooks/${hook.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !hook.isActive }) }).then(load)
                  }
                >
                  {hook.isActive ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete webhook"
                  onClick={() => void api(`/api/developer/webhooks/${hook.id}`, { method: "DELETE" }).then(load)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </span>
            </div>
          </div>
        ))}
        <p className="text-[12px] text-[#6b7280]">
          Verify deliveries: <code>X-Relay-Signature</code> is the hex HMAC-SHA256 of the raw body keyed by the signing secret.
        </p>
      </Panel>
    </div>
  );
}
