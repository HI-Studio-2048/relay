"use client";

import { useState } from "react";
import { BookOpen, Bot, MessageSquareDashed, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import type { BotAiSettings } from "@/lib/ai";

const EXAMPLES = [
  "When someone comments GUIDE on a post, DM them the free guide after they give their email, and tag them lead",
  "Welcome new followers who message us, ask what they're interested in (pricing, booking, support) and route each",
  "Thank people who mention us in their story and send a 10% code",
];

export function AiSettingsForm({
  botId,
  configured,
  initial,
}: {
  botId: string;
  configured: boolean;
  initial: BotAiSettings;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [building, setBuilding] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const data = await api<{ settings: BotAiSettings }>(`/api/bots/${botId}/ai`, {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings(data.settings);
      toast.success("AI settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const build = async () => {
    setBuilding(true);
    try {
      const data = await api<{ flow: { id: string } }>("/api/flows/generate", {
        method: "POST",
        body: JSON.stringify({ botId, prompt }),
      });
      toast.success("Flow drafted — review it, then switch it on");
      router.push(`/flows/${data.flow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not build the flow");
      setBuilding(false);
    }
  };

  return (
    <div className="space-y-5">
      {!configured ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          AI is off on this server. Set <code className="font-mono">ANTHROPIC_API_KEY</code> in the environment and
          restart. Your settings below still save.
        </div>
      ) : null}

      <Panel tone="action" icon={Wand2} label="Build a flow" title="Describe it, get a draft on the canvas">
        <div className="space-y-2">
          <Textarea
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="When someone comments PRICE on a reel, DM them our price list and ask if they want a call"
          />
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setPrompt(example)}
                className="rounded-full bg-[#f4f6f8] px-2.5 py-1 text-left text-[12px] text-[#6b7280] hover:bg-[#eef1f4] hover:text-[#1b1f24]"
              >
                {example}
              </button>
            ))}
          </div>
          <Button onClick={() => void build()} disabled={building || !prompt.trim() || !configured}>
            {building ? "Building…" : "Build flow"}
          </Button>
        </div>
      </Panel>

      <Panel tone="content" icon={Bot} label="Persona" title="Who is answering, and how they sound">
        <Textarea
          rows={4}
          value={settings.persona ?? ""}
          onChange={(event) => setSettings({ ...settings, persona: event.target.value })}
          placeholder="You're Maya from HI Studio. Friendly, upbeat, a little playful. Use the customer's first name. Always offer to book a free 15-minute call when someone seems ready."
        />
      </Panel>

      <Panel tone="input" icon={BookOpen} label="Knowledge" title="Facts the AI may use — nothing else">
        <Textarea
          rows={10}
          value={settings.knowledge ?? ""}
          onChange={(event) => setSettings({ ...settings, knowledge: event.target.value })}
          placeholder={"Prices: Starter $49/mo, Pro $149/mo\nHours: Mon–Fri 9–6 PT\nBooking link: https://cal.com/histudio\nRefunds: within 14 days, handled by a human\nFAQ: …"}
        />
        <p className="text-[12px] text-[#6b7280]">
          Paste FAQs, prices, links and policies. If the answer is not here, the AI says it will check and hands off.
        </p>
      </Panel>

      <Panel tone="start" icon={MessageSquareDashed} label="Auto-reply" title="Answer messages no flow or keyword catches">
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={Boolean(settings.autoReply)}
            onChange={(event) => setSettings({ ...settings, autoReply: event.target.checked })}
          />
          Let the AI reply when nothing else matches
        </label>
        <div className="space-y-1">
          <p className="text-[12px] text-[#6b7280]">Hand-off message (when the AI passes to your team)</p>
          <Input
            value={settings.handoffMessage ?? ""}
            onChange={(event) => setSettings({ ...settings, handoffMessage: event.target.value })}
            placeholder="Thanks! A teammate will pick this up shortly."
          />
        </div>
      </Panel>

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : "Save AI settings"}
      </Button>
    </div>
  );
}
