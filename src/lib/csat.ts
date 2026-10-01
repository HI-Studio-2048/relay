/**
 * CSAT: when a teammate marks a conversation Done, ask "How did we do?" with three buttons. A tap is
 * logged as an inbound "[rating] N" message, so the team report can score each teammate.
 */
export type CsatSettings = { enabled: boolean; question: string; thanks: string };

export const CSAT_OPTIONS = [
  { score: 3, label: "😀 Great" },
  { score: 2, label: "😐 Okay" },
  { score: 1, label: "🙁 Not good" },
] as const;

export const RATING_PREFIX = "[rating] ";

export function readCsat(settings: Record<string, unknown> | null | undefined): CsatSettings {
  const raw = (settings?.csat ?? {}) as Partial<CsatSettings>;
  return {
    enabled: Boolean(raw.enabled),
    question: typeof raw.question === "string" && raw.question.trim() ? raw.question.slice(0, 300) : "Thanks for chatting with us! How did we do?",
    thanks: typeof raw.thanks === "string" && raw.thanks.trim() ? raw.thanks.slice(0, 300) : "Thank you for the feedback 🙏",
  };
}

/** "csat:3" → 3; anything else → null. */
export function parseCsatPayload(data: string | null | undefined): number | null {
  const match = data?.match(/^csat:([1-3])$/);
  return match ? Number(match[1]) : null;
}

export function ratingBody(score: number) {
  const option = CSAT_OPTIONS.find((item) => item.score === score);
  return `${RATING_PREFIX}${score}/3 ${option?.label ?? ""}`.trim();
}

/** "[rating] 3/3 😀 Great" → 3. */
export function scoreFromBody(body: string): number | null {
  if (!body.startsWith(RATING_PREFIX)) return null;
  const score = Number(body.slice(RATING_PREFIX.length, RATING_PREFIX.length + 1));
  return score >= 1 && score <= 3 ? score : null;
}
