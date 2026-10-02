"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";

/** Copy this broadcast into a fresh draft (audience recounted) and open it. */
export function DuplicateButton({ broadcastId }: { broadcastId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const duplicate = async () => {
    setBusy(true);
    try {
      const data = await api<{ broadcast: { id: string } }>(`/api/broadcasts/${broadcastId}/duplicate`, { method: "POST" });
      toast.success("Copied. Review it, then confirm.");
      router.push(`/broadcasts/${data.broadcast.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not copy");
      setBusy(false);
    }
  };
  return (
    <Button variant="outline" size="sm" onClick={duplicate} disabled={busy}>
      {busy ? "Copying…" : "Duplicate"}
    </Button>
  );
}
