/**
 * Live Chat collision detection: who else has a conversation open, and who is typing. In memory on
 * purpose (seconds-long, best effort); kept on globalThis so every route bundle in the process shares it.
 */
type Seen = { at: number; typingAt: number | null };

const globalForPresence = globalThis as unknown as { relayPresence?: Map<string, Map<string, Seen>> };
const store = (globalForPresence.relayPresence ??= new Map());

const VIEW_TTL = 12_000;
const TYPING_TTL = 6_000;

let touches = 0;

/** Drop everything stale so conversations nobody reopens do not stay in memory. */
function sweep(now: number) {
  for (const [contactId, viewers] of store) {
    for (const [agentId, seen] of viewers) if (now - seen.at > VIEW_TTL) viewers.delete(agentId);
    if (viewers.size === 0) store.delete(contactId);
  }
}

export function touchPresence(contactId: string, agentId: string, typing: boolean, now = Date.now()) {
  touches += 1;
  if (touches % 200 === 0) sweep(now);
  if (contactId.length > 64 || agentId.length > 64) return;
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
