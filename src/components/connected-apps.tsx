"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TriangleAlert, Unplug } from "lucide-react";
import { toast } from "sonner";
import { CanvasCard } from "@/components/chrome/tone";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/client";
import type { PublicConnection } from "@/lib/oauth/connections";

export type ConnectedApp = {
  provider: string;
  label: string;
  purpose: string;
  /** False when this server has no client id and secret for it, so Connect would fail. */
  configured: boolean;
  connections: PublicConnection[];
};

const COLORS: Record<string, string> = { google: "#FF0000", tiktok: "#111111" };

/** Accounts that are connected for their data or sign-in, not for messaging: YouTube, TikTok. */
export function ConnectedApps({ apps }: { apps: ConnectedApp[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const disconnect = async (connection: PublicConnection, label: string) => {
    if (!window.confirm(`Disconnect ${connection.displayName ?? label}? Recatch deletes the stored sign-in. You can connect it again any time.`)) return;
    setBusy(connection.id);
    try {
      await api(`/api/connections/item/${connection.id}`, { method: "DELETE" });
      toast.success(`${label} disconnected`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-heading text-[15px] text-[#1b1f24]">Connected apps</h2>
        <p className="text-[13px] text-[#6b7280]">Sign in to an account to let Recatch read its details. These are separate from the messaging channels above.</p>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2">
        {apps.map((app) => (
          <CanvasCard key={app.provider} className="space-y-3 p-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold text-white"
                style={{ background: COLORS[app.provider] ?? "#6b7280" }}
              >
                {app.label.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[#1b1f24]">{app.label}</p>
                <p className="text-[12px] leading-snug text-[#6b7280]">{app.purpose}</p>
              </div>
              {app.configured ? (
                <Button size="sm" variant={app.connections.length ? "outline" : "default"} nativeButton={false} render={<a href={`/api/connections/${app.provider}/start`} />}>
                  {app.connections.length ? "Add another" : "Connect"}
                </Button>
              ) : (
                <span className="rounded-full bg-[#f4f6f8] px-2 py-0.5 text-[11px] text-[#6b7280]">Not set up on this server</span>
              )}
            </div>
            {app.connections.map((connection) => (
              <div key={connection.id} className="flex items-center gap-2 rounded-lg bg-[#f4f6f8] px-2.5 py-2">
                {connection.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={connection.avatarUrl} alt="" className="size-6 rounded-full" />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#1b1f24]">{connection.displayName ?? connection.externalAccountId}</span>
                {connection.status === "needs_reconnect" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#fffaeb] px-2 py-0.5 text-[11px] font-medium text-[#b54708]" title={connection.lastError ?? undefined}>
                    <TriangleAlert className="size-3" />
                    Needs reconnecting
                  </span>
                ) : null}
                <Button size="sm" variant="ghost" disabled={busy === connection.id} onClick={() => void disconnect(connection, app.label)} aria-label={`Disconnect ${connection.displayName ?? app.label}`}>
                  <Unplug className="size-3.5" />
                  <span className="hidden sm:inline">Disconnect</span>
                </Button>
              </div>
            ))}
          </CanvasCard>
        ))}
      </div>
    </div>
  );
}
