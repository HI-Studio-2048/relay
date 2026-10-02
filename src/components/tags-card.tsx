"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { api } from "@/lib/client";

type Tag = { id: string; name: string; contacts: number; flows: number };

/** Settings → Tags: every tag, how many contacts carry it and how many flows use it. */
export function TagsCard({ botId }: { botId: string }) {
  const [tags, setTags] = useState<Tag[] | null>(null);

  const load = useCallback(() => {
    api<{ tags: Tag[] }>(`/api/tags?botId=${botId}&usage=1`)
      .then((data) => setTags(data.tags.sort((a, b) => b.contacts - a.contacts || a.name.localeCompare(b.name))))
      .catch(() => setTags([]));
  }, [botId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const remove = async (tag: Tag) => {
    const warning = tag.flows ? ` ${tag.flows} flow${tag.flows === 1 ? " uses" : "s use"} it by name.` : "";
    if (!window.confirm(`Delete #${tag.name} from ${tag.contacts} contact${tag.contacts === 1 ? "" : "s"}?${warning}`)) return;
    try {
      await api(`/api/tags/${tag.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      setTags((current) => (current ?? []).filter((item) => item.id !== tag.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  };

  return (
    <Panel tone="action" icon={Hash} label="Tags" title="Tags on your contacts">
      {tags === null ? (
        <p className="text-[13px] text-[#6b7280]">Loading…</p>
      ) : tags.length === 0 ? (
        <p className="text-[13px] text-[#6b7280]">No tags yet. Tag steps, rules, bulk actions and Live Chat add them.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag.id} className="flex items-center gap-1.5 rounded-full bg-[#f5f3ff] py-0.5 pr-1 pl-2.5 text-[12px] text-[#4c1d95]">
              #{tag.name}
              <span className="tabular-nums text-[#7c6aa8]" title={`${tag.contacts} contacts · ${tag.flows} flows`}>
                {tag.contacts}
                {tag.flows ? ` · ${tag.flows}f` : ""}
              </span>
              <button type="button" aria-label={`Delete ${tag.name}`} onClick={() => void remove(tag)} className="rounded-full px-1 text-[#8b95a1] hover:text-red-600">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
