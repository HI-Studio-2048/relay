/**
 * The AI providers an account can bring its own key for. Pure and browser safe, so the AI assistant
 * page lists the same providers and models the server accepts. Server details (base URLs, how a key is
 * checked) live in ai-provider.ts.
 */
export const AI_VENDOR_IDS = ["anthropic", "openai", "google", "xai", "mistral", "groq", "deepseek", "openrouter"] as const;
export type AiVendor = (typeof AI_VENDOR_IDS)[number];

export type AiVendorInfo = {
  id: AiVendor;
  label: string;
  /** Where the owner makes a key. */
  keysUrl: string;
  keyPlaceholder: string;
  defaultModel: string;
  /** Suggested model ids. When `anyModel` is false these are the only ones accepted. */
  models: { id: string; label: string }[];
  anyModel: boolean;
};

export const AI_VENDORS: AiVendorInfo[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keyPlaceholder: "sk-ant-...",
    defaultModel: "claude-opus-5-5",
    // Only models that take everything Recatch sends (effort, structured output, adaptive thinking).
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5, the most capable" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5, faster and half the price" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5, the fastest and cheapest" },
    ],
    anyModel: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    keysUrl: "https://platform.openai.com/api-keys",
    keyPlaceholder: "sk-...",
    defaultModel: "gpt-5-mini",
    models: [
      { id: "gpt-5", label: "gpt-5" },
      { id: "gpt-5-mini", label: "gpt-5-mini" },
      { id: "gpt-4.1", label: "gpt-4.1" },
    ],
    anyModel: true,
  },
  {
    id: "google",
    label: "Google Gemini",
    keysUrl: "https://aistudio.google.com/apikey",
    keyPlaceholder: "AIza...",
    defaultModel: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-pro", label: "gemini-2.5-pro" },
      { id: "gemini-2.5-flash", label: "gemini-2.5-flash" },
    ],
    anyModel: true,
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    keysUrl: "https://console.x.ai",
    keyPlaceholder: "xai-...",
    defaultModel: "grok-4",
    models: [
      { id: "grok-4", label: "grok-4" },
      { id: "grok-3-mini", label: "grok-3-mini" },
    ],
    anyModel: true,
  },
  {
    id: "mistral",
    label: "Mistral",
    keysUrl: "https://console.mistral.ai/api-keys",
    keyPlaceholder: "Your Mistral API key",
    defaultModel: "mistral-large-latest",
    models: [
      { id: "mistral-large-latest", label: "mistral-large-latest" },
      { id: "mistral-small-latest", label: "mistral-small-latest" },
    ],
    anyModel: true,
  },
  {
    id: "groq",
    label: "Groq",
    keysUrl: "https://console.groq.com/keys",
    keyPlaceholder: "gsk_...",
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { id: "llama-3.3-70b-versatile", label: "llama-3.3-70b-versatile" },
      { id: "openai/gpt-oss-120b", label: "openai/gpt-oss-120b" },
    ],
    anyModel: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keysUrl: "https://platform.deepseek.com/api_keys",
    keyPlaceholder: "sk-...",
    defaultModel: "deepseek-chat",
    models: [{ id: "deepseek-chat", label: "deepseek-chat" }],
    anyModel: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter (any model)",
    keysUrl: "https://openrouter.ai/keys",
    keyPlaceholder: "sk-or-v1-...",
    defaultModel: "openai/gpt-4o-mini",
    models: [
      { id: "anthropic/claude-sonnet-4.5", label: "anthropic/claude-sonnet-4.5" },
      { id: "openai/gpt-4o-mini", label: "openai/gpt-4o-mini" },
      { id: "google/gemini-2.5-flash", label: "google/gemini-2.5-flash" },
    ],
    anyModel: true,
  },
];

/** What the browser may know about a saved key: never the key itself. */
export type AiKeyStatus = { connected: boolean; provider: AiVendor; model: string; hint: string };

export function isAiVendor(value: unknown): value is AiVendor {
  return typeof value === "string" && (AI_VENDOR_IDS as readonly string[]).includes(value);
}

export function vendorInfo(id: AiVendor): AiVendorInfo {
  return AI_VENDORS.find((vendor) => vendor.id === id)!;
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,119}$/;

/** The model to use: the one asked for when this provider accepts it, otherwise the provider's default. */
export function pickModel(vendor: AiVendor, model: string | null | undefined) {
  const info = vendorInfo(vendor);
  const wanted = (model ?? "").trim();
  if (!wanted) return info.defaultModel;
  if (!info.anyModel) return info.models.some((item) => item.id === wanted) ? wanted : info.defaultModel;
  return MODEL_ID.test(wanted) ? wanted : info.defaultModel;
}
