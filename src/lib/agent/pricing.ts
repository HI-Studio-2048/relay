/**
 * What a Claude call cost, from the usage the API reports. Pure and browser safe; agent/budget.ts
 * stores the result against the login's monthly allowance.
 */

/** USD per million tokens. Cache writes are 1.25x input for the 5-minute cache and 2x for the 1-hour one. */
type Rates = { input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number };

const RATES: Record<string, Rates> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite5m: 5, cacheWrite1h: 8 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite5m: 6.25, cacheWrite1h: 10 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite5m: 2.5, cacheWrite1h: 4 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite5m: 0.125, cacheWrite1h: 0.2 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite5m: 12.5, cacheWrite1h: 20 },
};

/** A model missing from the table is priced like the most expensive one, so the cap errs on the safe side. */
const UNKNOWN_MODEL_RATES = RATES["claude-fable-5-1"]!;

function ratesFor(model: string | null | undefined): Rates {
  if (!model) return UNKNOWN_MODEL_RATES;
  // Longest prefix, so a dated id still finds its model and claude-opus-5-5 never reads as claude-opus-5.
  const match = Object.keys(RATES)
    .filter((key) => model === key || model.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? RATES[match]! : UNKNOWN_MODEL_RATES;
}

type CacheCreation = { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null };

type AttemptUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_creation?: CacheCreation | null;
};

/** The slice of the SDK's usage object this needs. `iterations` lists every attempt, refusal fallbacks included. */
export type UsageReport = AttemptUsage & { iterations?: (AttemptUsage & { model?: string | null })[] | null };

export type AgentUsage = { costMicros: number; inputTokens: number; outputTokens: number };

/**
 * Price one response in millionths of a dollar. When the API lists `iterations` (a refusal that fell
 * back to another model, for one), each attempt is priced at the rates of the model that ran it;
 * otherwise the top-level usage is priced as `model`, the model that answered. Thinking tokens are
 * already counted in `output_tokens`.
 */
export function priceUsage(usage: UsageReport, model: string): AgentUsage {
  const attempts: (AttemptUsage & { model?: string | null })[] = usage.iterations?.length ? usage.iterations : [usage];
  let micros = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  for (const attempt of attempts) {
    const rates = ratesFor(attempt.model || model);
    const input = attempt.input_tokens ?? 0;
    const output = attempt.output_tokens ?? 0;
    const read = attempt.cache_read_input_tokens ?? 0;
    const written = attempt.cache_creation_input_tokens ?? 0;
    const hour = Math.min(written, attempt.cache_creation?.ephemeral_1h_input_tokens ?? 0);
    // tokens x USD per million tokens = millionths of a dollar.
    micros +=
      input * rates.input + output * rates.output + read * rates.cacheRead + (written - hour) * rates.cacheWrite5m + hour * rates.cacheWrite1h;
    inputTokens += input + read + written;
    outputTokens += output;
  }
  return { costMicros: Math.ceil(micros), inputTokens, outputTokens };
}
