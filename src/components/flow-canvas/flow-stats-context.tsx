"use client";

import { createContext, useContext } from "react";

export type NodeStats = { sent: number; clicks: number; ctr: number };

/** Per-canvas-node delivery stats (sent / clicked), keyed by node id. Empty when there is no data. */
export const FlowStatsContext = createContext<Record<string, NodeStats>>({});

export function useNodeStats(id: string | undefined) {
  const stats = useContext(FlowStatsContext);
  return id ? stats[id] : undefined;
}
