"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

export function CreateFlowForm({ botId }: { botId: string }) {
  const [name, setName] = useState("");
  const router = useRouter();

  const create = async () => {
    if (!name.trim()) return;
    try {
      const data = await api<{ flow: { id: string } }>("/api/flows", {
        method: "POST",
        body: JSON.stringify({
          botId,
          name,
          triggerType: "keyword",
          triggerValue: name.toLowerCase(),
        }),
      });
      router.push(`/flows/${data.flow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create flow");
    }
  };

  return (
    <div className="flex gap-2">
      <Input placeholder="New flow name" value={name} onChange={(e) => setName(e.target.value)} />
      <Button onClick={() => void create()}>Create</Button>
    </div>
  );
}
