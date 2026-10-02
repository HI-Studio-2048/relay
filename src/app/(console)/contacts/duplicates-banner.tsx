"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { PlatformBadge } from "@/components/chrome/platform-badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

type Person = { id: string; name: string; platform: string | null; detail: string };
type Pair = { reason: string; keep: Person; drop: Person };

/** "Same person on two networks": review and merge contacts that share an email or phone. */
export function DuplicatesBanner({ botId }: { botId: string }) {
  const router = useRouter();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ pairs: Pair[] }>(`/api/contacts/duplicates?botId=${botId}`)
      .then((data) => {
        if (!cancelled) setPairs(data.pairs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [botId]);

  const merge = async (pair: Pair) => {
    if (!window.confirm(`Merge ${pair.drop.name} into ${pair.keep.name}? Messages, tags and fields move over; replies keep going to ${pair.keep.name}'s channel.`)) return;
    setBusy(pair.drop.id);
    try {
      await api("/api/contacts/merge", { method: "POST", body: JSON.stringify({ keepId: pair.keep.id, dropId: pair.drop.id, confirm: true }) });
      setPairs((current) => current.filter((item) => item.drop.id !== pair.drop.id && item.keep.id !== pair.drop.id));
      toast.success("Merged");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not merge");
    } finally {
      setBusy(null);
    }
  };

  if (pairs.length === 0) return null;
  return (
    <div className="rounded-2xl bg-[#fffbea] p-3 ring-1 ring-[#f3d36b]">
      <button type="button" className="flex w-full items-center gap-2 text-left text-[13px] text-[#5c4a00]" onClick={() => setOpen((value) => !value)}>
        <Users className="size-4" />
        <span className="flex-1">
          {pairs.length} possible duplicate{pairs.length === 1 ? "" : "s"} — the same person reaching you on more than one network
        </span>
        <span className="font-medium underline">{open ? "Hide" : "Review"}</span>
      </button>
      {open ? (
        <ul className="mt-3 space-y-2">
          {pairs.map((pair) => (
            <li key={`${pair.keep.id}-${pair.drop.id}`} className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2 text-[13px] ring-1 ring-[#f3e3a1]">
              <span className="flex items-center gap-1.5 font-medium">
                {pair.keep.name} <PlatformBadge platform={pair.keep.platform} />
              </span>
              <span className="text-[#8b95a1]">←</span>
              <span className="flex items-center gap-1.5">
                {pair.drop.name} <PlatformBadge platform={pair.drop.platform} />
              </span>
              <span className="text-[12px] text-[#6b7280]">
                {pair.reason} · {pair.keep.detail}
              </span>
              <Button size="xs" className="ml-auto" disabled={busy !== null} onClick={() => void merge(pair)}>
                {busy === pair.drop.id ? "Merging…" : "Merge"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
