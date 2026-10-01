"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

export type TeamMember = { id: string; name: string; email: string | null; color: string };

const COOKIE = "relay.agent";

function readAgentCookie() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)relay\.agent=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

/** Team members plus who is using this browser (stored in a cookie so replies are attributed server-side). */
export function useTeam() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [me, setMeState] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await api<{ team: TeamMember[] }>("/api/team");
    setTeam(data.team);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMeState(readAgentCookie());
      void reload().catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  const setMe = (id: string | null) => {
    document.cookie = id ? `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax` : `${COOKIE}=; path=/; max-age=0`;
    setMeState(id);
  };

  return { team, me, setMe, reload, byId: (id: string | null | undefined) => team.find((member) => member.id === id) ?? null };
}
