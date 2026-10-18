"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ChannelId } from "@/lib/channels/types";
import { BOT_STORAGE_KEY, api } from "@/lib/client";
import { ALL_CHANNELS } from "@/lib/scope";

export type PublicBot = {
  id: string;
  name: string;
  channel: ChannelId;
  telegramUsername: string | null;
  externalAccountId?: string | null;
  hasAppSecret?: boolean;
  discordShared?: boolean;
  /** Meta accounts (Instagram, Messenger, WhatsApp) connected through the Meta sign-in. */
  linkedAccounts?: { id: string; platform: string; username: string | null; needsReconnection?: boolean }[];
  verifyToken?: string | null;
  status: string;
  webhookUrl: string | null;
  lastHealthAt: string | null;
  lastHealthError: string | null;
  createdAt?: string;
};

type BotContextValue = {
  bots: PublicBot[];
  /** Concrete channel editor pages use. Stays set while the view is All channels. */
  bot: PublicBot | null;
  botId: string | null;
  /** `all` or a channel id. Overview and Live Chat follow this. */
  scope: string;
  aggregate: boolean;
  loading: boolean;
  setBotId: (id: string) => void;
  refresh: () => Promise<void>;
};

const BotContext = createContext<BotContextValue | null>(null);

export function BotProvider({
  children,
  initialBots = [],
  initialBotId = null,
  initialScope = null,
}: {
  children: React.ReactNode;
  initialBots?: PublicBot[];
  /** Concrete channel for editor pages. */
  initialBotId?: string | null;
  /** `all` or a channel id. Defaults to All channels. */
  initialScope?: string | null;
}) {
  const router = useRouter();
  const [bots, setBots] = useState<PublicBot[]>(initialBots);
  const [botId, setBotIdState] = useState<string | null>(initialBotId ?? initialBots[0]?.id ?? null);
  const [scope, setScopeState] = useState<string>(initialScope ?? ALL_CHANNELS);
  const [loading, setLoading] = useState(initialBots.length === 0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ bots: PublicBot[] }>("/api/bots");
      setBots(data.bots);
      setBotIdState((current) => (current && data.bots.some((bot) => bot.id === current) ? current : data.bots[0]?.id ?? null));
      setScopeState((current) => (current === ALL_CHANNELS || data.bots.some((bot) => bot.id === current) ? current : ALL_CHANNELS));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setBotId = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(BOT_STORAGE_KEY, id);
      } catch {
        // Private mode can reject storage; the cookie is what server pages read.
      }
      if (id === ALL_CHANNELS) setScopeState(ALL_CHANNELS);
      else {
        setScopeState(id);
        setBotIdState(id);
      }
      // Server pages read the cookie, so switching accounts re-renders inbox, contacts, and flows for it.
      void api("/api/bots/select", { method: "POST", body: JSON.stringify({ botId: id }) })
        .then(() => router.refresh())
        .catch(() => undefined);
    },
    [router],
  );

  const value = useMemo(
    () => ({
      bots,
      bot: bots.find((item) => item.id === botId) ?? null,
      botId,
      scope,
      aggregate: scope === ALL_CHANNELS,
      loading,
      setBotId,
      refresh,
    }),
    [bots, botId, scope, loading, setBotId, refresh],
  );

  return <BotContext.Provider value={value}>{children}</BotContext.Provider>;
}

export function useBot() {
  const value = useContext(BotContext);
  if (!value) throw new Error("useBot must be used within BotProvider");
  return value;
}
