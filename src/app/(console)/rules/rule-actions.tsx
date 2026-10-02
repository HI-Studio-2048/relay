"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import { cn } from "@/lib/utils";

/** On/off switch and delete for one rule. */
export function RuleActions({ id, botId, isActive }: { id: string; botId: string; isActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(isActive);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await api("/api/rules", { method: "PATCH", body: JSON.stringify({ id, botId, isActive: !active }) });
      setActive(!active);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this rule?")) return;
    setBusy(true);
    try {
      await api("/api/rules", { method: "DELETE", body: JSON.stringify({ id, botId, confirm: true }) });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={active ? "Turn rule off" : "Turn rule on"}
        disabled={busy}
        onClick={() => void toggle()}
        className={cn("relative inline-flex h-5 w-9 rounded-full transition-colors", active ? "bg-[#00c853]" : "bg-[#d1d5db]")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", active ? "left-[18px]" : "left-0.5")} />
      </button>
      <Button size="xs" variant="ghost" disabled={busy} onClick={() => void remove()}>
        Delete
      </Button>
    </div>
  );
}
