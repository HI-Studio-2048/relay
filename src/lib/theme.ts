/**
 * Shared Relay / Flow canvas tokens.
 *
 * UI chrome should import from here or `@/components/chrome/tone` — not from
 * `flow-canvas/**`. Hex values stay in sync with `--relay-*` in `globals.css`.
 * Tailwind utilities: `bg-relay-canvas`, `text-relay-ink`, `border-relay-line`.
 */

export const RELAY = {
  start: "#00C853",
  content: "#0084FF",
  input: "#00C2CB",
  action: "#7B61FF",
  stop: "#8B95A1",
  canvas: "#F4F6F8",
  card: "#FFFFFF",
  ink: "#1B1F24",
  muted: "#6B7280",
  line: "#C5CDD6",
  lineSelected: "#0084FF",
  cardBorder: "#E5E7EB",
  wash: "#EEF1F4",
  setField: "#E64980",
  subscribe: "#12B886",
  delay: "#4C6EF5",
  condition: "#FFB800",
  startFlow: "#5F3DC4",
  http: "#0CA678",
  notify: "#F76707",
  randomizer: "#E67700",
  ai: "#D946EF",
} as const;

/** @deprecated Use RELAY. Same hex map — kept so existing canvas imports stay short. */
export const MANYCHAT = RELAY;

export type ThemeTone = "start" | "content" | "input" | "action" | "stop";

export const RELAY_SHADOW = "0 1px 3px rgba(16,24,40,0.10)";
export const RELAY_RADIUS = "1rem";

export const RELAY_CSS_VARS = {
  start: "--relay-start",
  content: "--relay-content",
  input: "--relay-input",
  action: "--relay-action",
  stop: "--relay-stop",
  canvas: "--relay-canvas",
  card: "--relay-card",
  ink: "--relay-ink",
  muted: "--relay-muted",
  line: "--relay-line",
  lineSelected: "--relay-line-selected",
  cardBorder: "--relay-card-border",
  wash: "--relay-wash",
  setField: "--relay-set-field",
  subscribe: "--relay-subscribe",
  delay: "--relay-delay",
  condition: "--relay-condition",
  startFlow: "--relay-start-flow",
  http: "--relay-http",
  notify: "--relay-notify",
  randomizer: "--relay-randomizer",
  shadow: "--relay-shadow",
  radius: "--relay-radius",
} as const;

export function relayVar(token: keyof typeof RELAY_CSS_VARS): string {
  return `var(${RELAY_CSS_VARS[token]})`;
}

export function themeHex(tone?: ThemeTone, hex?: string): string {
  return hex ?? (tone ? RELAY[tone] : RELAY.content);
}
