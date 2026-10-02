"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/chrome/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/client";

/** Settings → Payments: Stripe Payment Links in flows, purchases counted as goals with revenue. */
export function StripeCard({ botId }: { botId: string }) {
  const [origin, setOrigin] = useState("");
  const [state, setState] = useState<{ connected: boolean; goalName: string; tag: string } | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const webhookUrl = `${origin}/api/stripe/webhook/${botId}`;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => setOrigin(window.location.origin), 0);
    api<{ connected: boolean; goalName: string; tag: string }>(`/api/bots/${botId}/stripe`)
      .then((data) => {
        if (!cancelled) setState(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [botId]);

  const save = async (patch: Record<string, unknown>) => {
    setBusy(true);
    try {
      const data = await api<{ connected: boolean; goalName: string; tag: string }>(`/api/bots/${botId}/stripe`, { method: "PUT", body: JSON.stringify(patch) });
      setState(data);
      setSecret("");
      toast.success("Saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel tone="start" icon={CreditCard} label="Payments" title="Sell in the DM with Stripe Payment Links">
      <ol className="list-decimal space-y-1 pl-5 text-[13px] text-[#374151]">
        <li>
          In a flow, add a link button to your Stripe Payment Link with <code className="rounded bg-[#f4f6f8] px-1">?client_reference_id={"{{contact_id}}"}</code> at the end.
        </li>
        <li>
          In Stripe → Developers → Webhooks, add this endpoint for <code className="rounded bg-[#f4f6f8] px-1">checkout.session.completed</code>:
          <span className="mt-1 block break-all rounded-lg bg-[#f4f6f8] px-2 py-1 font-mono text-[12px]">{webhookUrl}</span>
        </li>
        <li>Paste its signing secret below. Each payment becomes a goal with the amount, credited to the flow that sent the link.</li>
      </ol>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          placeholder={state?.connected ? "Connected — paste a new whsec_… to replace" : "whsec_…"}
        />
        <Button size="sm" disabled={busy || !secret.trim()} onClick={() => void save({ webhookSecret: secret })}>
          {state?.connected ? "Replace" : "Connect"}
        </Button>
        {state?.connected ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save({ disconnect: true })}>
            Disconnect
          </Button>
        ) : null}
      </div>
      {state ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-[12px] text-[#6b7280]">
            Goal name
            <Input defaultValue={state.goalName} onBlur={(event) => event.target.value !== state.goalName && void save({ goalName: event.target.value })} />
          </label>
          <label className="space-y-1 text-[12px] text-[#6b7280]">
            Tag buyers (optional)
            <Input defaultValue={state.tag} onBlur={(event) => event.target.value !== state.tag && void save({ tag: event.target.value })} />
          </label>
        </div>
      ) : null}
    </Panel>
  );
}
