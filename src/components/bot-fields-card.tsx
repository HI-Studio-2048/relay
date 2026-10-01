"use client";

import { useEffect, useState } from "react";
import { Braces, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";
import type { BotField } from "@/lib/template";

/** Settings card: account-wide variables used as {{bot.key}} in flows, broadcasts and replies. */
export function BotFieldsCard({ botId }: { botId: string }) {
  const [fields, setFields] = useState<BotField[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () =>
        void api<{ botFields: BotField[] }>(`/api/bots/${botId}/bot-fields`)
          .then((data) => setFields(data.botFields))
          .catch(() => undefined),
      0,
    );
    return () => clearTimeout(timer);
  }, [botId]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await api<{ botFields: BotField[] }>(`/api/bots/${botId}/bot-fields`, { method: "PUT", body: JSON.stringify({ botFields: fields }) });
      setFields(data.botFields);
      toast.success("Bot fields saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel tone="action" icon={Braces} label="Bot fields" title="Values you reuse everywhere — change once, every message updates">
      {fields.map((field, index) => (
        <div key={index} className="flex items-center gap-2">
          <Input
            className="w-44 font-mono text-[12px]"
            value={field.key}
            placeholder="promo_code"
            onChange={(event) => setFields(fields.map((item, i) => (i === index ? { ...item, key: event.target.value } : item)))}
          />
          <Input
            className="flex-1"
            value={field.value}
            placeholder="SPRING20"
            onChange={(event) => setFields(fields.map((item, i) => (i === index ? { ...item, value: event.target.value } : item)))}
          />
          <code className="hidden text-[11px] text-[#6b7280] sm:block">{`{{bot.${field.key || "key"}}}`}</code>
          <button type="button" aria-label="Remove" className="p-1 text-[#8b95a1] hover:text-[#1b1f24]" onClick={() => setFields(fields.filter((_, i) => i !== index))}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setFields([...fields, { key: "", value: "" }])}>
          <Plus className="size-3.5" />
          Add field
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Panel>
  );
}
