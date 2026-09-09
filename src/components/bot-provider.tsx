"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { BOT_STORAGE_KEY, api } from "@/lib/client";

export type PublicBot = {
  id: string;
  name: string;
  channel: "telegram" | "instagram" | "messenger" | "whatsapp";
  telegramUsername: string | null;
  externalAccountId?: string | null;
  hasAppSecret?: boolean;
  verifyToken?: string | null;
  status: string;
  webhookUrl: string | null;
  lastHealthAt: string | null;
  lastHealthError: string | null;
  createdAt?: string;
};

type BotContextValue = {
  bots: PublicBot[];
  bot: PublicBot | null;
  botId: string | null;
  loading: boolean;
  setBotId: (id: string) => void;
  refresh: () => Promise<void>;
};

const BotContext = createContext<BotContextValue | null>(null);

function pickBotId(bots: PublicBot[], current: string | null) {
  const stored = typeof window !== "undefined" ? localStorage.getItem(BOT_STORAGE_KEY) : null;
  const next = current ?? stored;
  if (next && bots.some((bot) => bot.id === next)) return next;
  return bots[0]?.id ?? null;
}

export function BotProvider({
  children,
  initialBots = [],
  initialBotId = null,
}: {
  children: React.ReactNode;
  initialBots?: PublicBot[];
  /** Server-selected account (cookie), so the first render matches the server pages. */
  initialBotId?: string | null;
}) {
  const router = useRouter();
  const [bots, setBots] = useState<PublicBot[]>(initialBots);
  const [botId, setBotIdState] = useState<string | null>(initialBotId ?? initialBots[0]?.id ?? null);
  const [loading, setLoading] = useState(initialBots.length === 0);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{ bots: PublicBot[] }>("/api/bots");
      setBots(data.bots);
      setBotIdState((current) => pickBotId(data.bots, current));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setBotId = useCallback(
    (id: string) => {
      localStorage.setItem(BOT_STORAGE_KEY, id);
      setBotIdState(id);
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
      loading,
      setBotId,
      refresh,
    }),
    [bots, botId, loading, setBotId, refresh],
  );

  return <BotContext.Provider value={value}>{children}</BotContext.Provider>;
}

export function useBot() {
  const value = useContext(BotContext);
  if (!value) throw new Error("useBot must be used within BotProvider");
  return value;
}
