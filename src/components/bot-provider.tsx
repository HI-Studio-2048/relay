"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ChannelId } from "@/lib/channels/types";
import { api } from "@/lib/client";
import { ALL_CHANNELS, applySelection } from "@/lib/scope";

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
  /**
   * Pick `all` or a channel. `keepView` is for single-account pages: it moves the account they
   * edit and leaves Overview and Live Chat on All channels (see `applySelection`).
   */
  setBotId: (id: string, options?: { keepView?: boolean }) => void;
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
    (id: string, options?: { keepView?: boolean }) => {
      const keepView = options?.keepView === true;
      // Same rule the select route uses to write the cookies, so this state and the server agree.
      const next = applySelection({ aggregate: scope === ALL_CHANNELS }, id, keepView);
      setScopeState(next.aggregate ? ALL_CHANNELS : id);
      if (next.focus) setBotIdState(next.focus);
      // Server pages read the cookie, so switching accounts re-renders inbox, contacts, and flows for it.
      void api("/api/bots/select", { method: "POST", body: JSON.stringify({ botId: id, keepView }) })
        .then(() => router.refresh())
        .catch(() => undefined);
    },
    [router, scope],
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

/**
 * Pins the context to one account for a page that belongs to it, like the flow editor,
 * whatever the switcher last picked. Without it the simulator and AI rewrite would read
 * the switcher's account while the canvas saves to the flow's own.
 */
export function PinnedBot({ botId, children }: { botId: string; children: React.ReactNode }) {
  const parent = useBot();
  const { botId: picked, bots, setBotId } = parent;
  // Move the switcher (and the cookie server pages read) to this account, so the sidebar and
  // the next page agree with what is on screen. Overview links open flows from any account.
  useEffect(() => {
    if (picked !== botId && bots.some((item) => item.id === botId)) setBotId(botId, { keepView: true });
  }, [picked, botId, bots, setBotId]);
  const value = useMemo(
    () => ({ ...parent, bot: parent.bots.find((item) => item.id === botId) ?? null, botId, scope: botId, aggregate: false }),
    [parent, botId],
  );
  return <BotContext.Provider value={value}>{children}</BotContext.Provider>;
}
