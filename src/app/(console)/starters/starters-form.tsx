"use client";

import { useState } from "react";
import { Clock, Menu, MessageCircleQuestion, Plus, ShieldCheck, X, Smile } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CsatSettings } from "@/lib/csat";
import { api } from "@/lib/client";
import type { ChannelId } from "@/lib/channels/types";
import { WEEKDAYS, type BusinessHours, type StarterItem, type StartersSettings } from "@/lib/starters";
import type { ModerationSettings } from "@/lib/social-triggers";

const DAY_LABEL: Record<(typeof WEEKDAYS)[number], string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

const ZONES = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Europe/Madrid", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC"];

function ItemsEditor({
  items,
  max,
  allowUrl,
  flows,
  placeholder,
  onChange,
}: {
  items: StarterItem[];
  max: number;
  allowUrl: boolean;
  flows: { id: string; name: string }[];
  placeholder: string;
  onChange: (next: StarterItem[]) => void;
}) {
  const update = (index: number, patch: Partial<StarterItem>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex flex-wrap items-center gap-1.5">
          <Input className="min-w-48 flex-1" value={item.title} placeholder={placeholder} onChange={(event) => update(index, { title: event.target.value })} />
          <select
            aria-label="Opens"
            className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-[13px]"
            value={item.url !== null && item.url !== undefined && !item.flowId ? "__url" : item.flowId ?? ""}
            onChange={(event) =>
              event.target.value === "__url" ? update(index, { flowId: null, url: item.url ?? "https://" }) : update(index, { flowId: event.target.value, url: null })
            }
          >
            <option value="" disabled>
              Opens…
            </option>
            {flows.map((flow) => (
              <option key={flow.id} value={flow.id}>
                Flow: {flow.name}
              </option>
            ))}
            {allowUrl ? <option value="__url">A link</option> : null}
          </select>
          {allowUrl && !item.flowId && item.url !== null && item.url !== undefined ? (
            <Input className="w-56" value={item.url} onChange={(event) => update(index, { url: event.target.value })} />
          ) : null}
          <button type="button" aria-label="Remove" className="p-1 text-[#8b95a1] hover:text-[#1b1f24]" onClick={() => onChange(items.filter((_, i) => i !== index))}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {items.length < max ? (
        <button
          type="button"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium text-[#0084ff] hover:bg-[#eef6ff]"
          onClick={() => onChange([...items, { title: "", flowId: flows[0]?.id ?? null, url: null }])}
        >
          <Plus className="size-3.5" /> Add ({items.length}/{max})
        </button>
      ) : null}
    </div>
  );
}

export function StartersForm({
  botId,
  channel,
  flows,
  initialStarters,
  initialHours,
  initialModeration,
  initialCsat,
}: {
  botId: string;
  channel: ChannelId;
  flows: { id: string; name: string }[];
  initialStarters: StartersSettings;
  initialHours: BusinessHours;
  initialModeration: ModerationSettings;
  initialCsat: CsatSettings;
}) {
  const [csat, setCsat] = useState(initialCsat);
  const [starters, setStarters] = useState(initialStarters);
  const [hours, setHours] = useState(initialHours);
  const [saving, setSaving] = useState(false);
  const [moderation, setModeration] = useState(initialModeration);
  const [wordsText, setWordsText] = useState(initialModeration.words.join(", "));
  const metaCapable = channel === "zernio" || channel === "instagram" || channel === "messenger";

  const save = async () => {
    setSaving(true);
    try {
      const data = await api<{ sync: { target: string; ok: boolean; error?: string }[] }>(`/api/bots/${botId}/starters`, {
        method: "PUT",
        body: JSON.stringify({
          starters,
          hours,
          csat,
          moderation: { ...moderation, words: wordsText.split(/[,\n]+/).map((word) => word.trim()).filter(Boolean) },
        }),
      });
      const failed = data.sync.filter((item) => !item.ok);
      if (failed.length) toast.error(`Saved, but ${failed.map((item) => `${item.target}: ${item.error}`).join("; ")}`);
      else toast.success(data.sync.length ? `Saved and synced to ${data.sync.map((item) => item.target).join(", ")}` : "Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {metaCapable ? (
        <>
          <Panel tone="content" icon={MessageCircleQuestion} label="Instagram ice breakers" title="Up to 4 questions people can tap to start a chat">
            <ItemsEditor
              items={starters.iceBreakers}
              max={4}
              allowUrl={false}
              flows={flows}
              placeholder="What are your prices?"
              onChange={(iceBreakers) => setStarters({ ...starters, iceBreakers })}
            />
          </Panel>
          <Panel tone="action" icon={Menu} label="Messenger menu" title="Always available from the composer (up to 3 items)">
            <ItemsEditor
              items={starters.menu}
              max={3}
              allowUrl
              flows={flows}
              placeholder="Book a call"
              onChange={(menu) => setStarters({ ...starters, menu })}
            />
          </Panel>
        </>
      ) : (
        <p className="rounded-xl bg-white px-4 py-3 text-[13px] text-[#6b7280] ring-1 ring-[#e5e7eb]">
          Telegram shows command flows in its “/” menu automatically — create a flow with a Command trigger. Ice breakers
          and menus apply to Instagram and Messenger accounts.
        </p>
      )}

      <Panel tone="start" icon={Clock} label="Business hours" title="Let people know when a human will answer">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={hours.enabled} onChange={(event) => setHours({ ...hours, enabled: event.target.checked })} />
          Send an away message outside these hours (once every 12 hours per person, only when no flow or AI answered)
        </label>
        <select
          aria-label="Time zone"
          className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-[13px]"
          value={hours.timezone}
          onChange={(event) => setHours({ ...hours, timezone: event.target.value })}
        >
          {[...new Set([hours.timezone, ...ZONES])].map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {WEEKDAYS.map((day) => {
            const value = hours.days[day];
            return (
              <div key={day} className="flex items-center gap-2 text-[13px]">
                <label className="flex w-16 items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) =>
                      setHours({ ...hours, days: { ...hours.days, [day]: event.target.checked ? { open: "09:00", close: "17:00" } : undefined } })
                    }
                  />
                  {DAY_LABEL[day]}
                </label>
                {value ? (
                  <>
                    <input
                      type="time"
                      aria-label={`${DAY_LABEL[day]} opens`}
                      className="rounded-lg border border-[#e5e7eb] px-2 py-1"
                      value={value.open}
                      onChange={(event) => setHours({ ...hours, days: { ...hours.days, [day]: { ...value, open: event.target.value } } })}
                    />
                    –
                    <input
                      type="time"
                      aria-label={`${DAY_LABEL[day]} closes`}
                      className="rounded-lg border border-[#e5e7eb] px-2 py-1"
                      value={value.close}
                      onChange={(event) => setHours({ ...hours, days: { ...hours.days, [day]: { ...value, close: event.target.value } } })}
                    />
                  </>
                ) : (
                  <span className="text-[#8b95a1]">Closed</span>
                )}
              </div>
            );
          })}
        </div>
        <Textarea rows={2} value={hours.awayMessage} onChange={(event) => setHours({ ...hours, awayMessage: event.target.value })} />
      </Panel>

      {channel === "zernio" ? (
        <Panel tone="stop" icon={ShieldCheck} label="Comment moderation" title="Hide spam and abuse before anyone sees it">
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={moderation.enabled} onChange={(event) => setModeration({ ...moderation, enabled: event.target.checked })} />
            Hide comments that match — they get no reply and are logged in Live Chat
          </label>
          <Textarea rows={2} value={wordsText} onChange={(event) => setWordsText(event.target.value)} placeholder="scam, crypto, dm me, free followers" />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={moderation.hideLinks} onChange={(event) => setModeration({ ...moderation, hideLinks: event.target.checked })} />
            Also hide comments with links
          </label>
        </Panel>
      ) : null}

      <Panel tone="input" icon={Smile} label="Satisfaction survey" title="Ask how it went when a chat is done">
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={csat.enabled} onChange={(event) => setCsat({ ...csat, enabled: event.target.checked })} />
          When a teammate marks a conversation Done, send a rating request (😀 / 😐 / 🙁)
        </label>
        <Textarea rows={2} value={csat.question} onChange={(event) => setCsat({ ...csat, question: event.target.value })} />
        <Textarea rows={1} value={csat.thanks} placeholder="Thank-you reply" onChange={(event) => setCsat({ ...csat, thanks: event.target.value })} />
        <p className="text-[12px] text-[#6b7280]">Only sent when a teammate replied in the last 7 days. Scores show per teammate on Overview.</p>
      </Panel>

      <Button onClick={() => void save()} disabled={saving}>
        {saving ? "Saving…" : metaCapable ? "Save and sync" : "Save"}
      </Button>
    </div>
  );
}
