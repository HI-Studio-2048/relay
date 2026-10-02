"use client";

import { useEffect, useState } from "react";
import { Tags, X } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

type Rule = { tag: string; description: string };

/** AI auto-tags: describe a tag in plain words; Claude applies it when someone's message fits. */
export function AutoTagsCard({ botId, configured }: { botId: string; configured: boolean }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<{ autoTags: Rule[] }>(`/api/bots/${botId}/auto-tags`)
      .then((data) => {
        if (!cancelled) setRules(data.autoTags);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [botId]);

  const update = (index: number, patch: Partial<Rule>) => setRules((current) => current.map((rule, at) => (at === index ? { ...rule, ...patch } : rule)));

  const save = async () => {
    setBusy(true);
    try {
      const data = await api<{ autoTags: Rule[] }>(`/api/bots/${botId}/auto-tags`, { method: "PUT", body: JSON.stringify({ autoTags: rules }) });
      setRules(data.autoTags);
      toast.success(data.autoTags.length ? `Saved ${data.autoTags.length} auto-tag${data.autoTags.length === 1 ? "" : "s"}` : "Auto-tags off");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel tone="action" icon={Tags} label="AI auto-tags" title="Tag people by what they say, in any wording">
      <p className="text-[13px] text-[#6b7280]">
        Describe a tag in plain words. When a message fits, Claude adds the tag, which can start sequences, rules and webhooks.
        Each tag is added once; people who already have it are skipped.
        {configured ? "" : " Add an Anthropic API key to turn this on."}
      </p>
      <div className="space-y-2">
        {rules.map((rule, index) => (
          <div key={index} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={rule.tag}
              onChange={(event) => update(index, { tag: event.target.value })}
              placeholder="wholesale-lead"
              aria-label="Tag"
              className="sm:w-44"
            />
            <Input
              value={rule.description}
              onChange={(event) => update(index, { description: event.target.value })}
              placeholder="Asks about bulk, wholesale or reseller pricing"
              aria-label="When to apply it"
              className="flex-1"
            />
            <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setRules((current) => current.filter((_, at) => at !== index))}>
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={rules.length >= 20} onClick={() => setRules((current) => [...current, { tag: "", description: "" }])}>
          Add auto-tag
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Panel>
  );
}
