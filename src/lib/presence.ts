/**
 * Live Chat collision detection: who else has a conversation open, and who is typing. In memory on
 * purpose (seconds-long, best effort); kept on globalThis so every route bundle in the process shares it.
 */
type Seen = { at: number; typingAt: number | null };

const globalForPresence = globalThis as unknown as { relayPresence?: Map<string, Map<string, Seen>> };
const store = (globalForPresence.relayPresence ??= new Map());

const VIEW_TTL = 12_000;
const TYPING_TTL = 6_000;

export function touchPresence(contactId: string, agentId: string, typing: boolean, now = Date.now()) {
  const viewers = store.get(contactId) ?? new Map<string, Seen>();
  const previous = viewers.get(agentId);
  viewers.set(agentId, { at: now, typingAt: typing ? now : previous?.typingAt ?? null });
  store.set(contactId, viewers);
}

/** Other teammates on this conversation right now. */
export function othersHere(contactId: string, agentId: string | null, now = Date.now()) {
  const viewers = store.get(contactId);
  if (!viewers) return [];
  const result: { agentId: string; typing: boolean }[] = [];
  for (const [id, seen] of viewers) {
    if (now - seen.at > VIEW_TTL) {
      viewers.delete(id);
      continue;
    }
    if (id === agentId) continue;
    result.push({ agentId: id, typing: seen.typingAt !== null && now - seen.typingAt < TYPING_TTL });
  }
  if (viewers.size === 0) store.delete(contactId);
  return result;
}
