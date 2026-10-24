import { describe, expect, it } from "vitest";
import { priceUsage } from "@/lib/agent/pricing";

describe("assistant call pricing", () => {
  it("prices input, output and both cache rates for Claude Opus 5.5", () => {
    expect(priceUsage({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5-5").costMicros).toBe(4_000_000);
    expect(priceUsage({ input_tokens: 0, output_tokens: 1_000_000 }, "claude-opus-5-5").costMicros).toBe(20_000_000);
    expect(priceUsage({ cache_read_input_tokens: 1_000_000 }, "claude-opus-5-5").costMicros).toBe(200_000);
    // 5-minute writes at 1.25x input, 1-hour writes at 2x.
    expect(
      priceUsage(
        { cache_creation_input_tokens: 2_000_000, cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 } },
        "claude-opus-5-5",
      ).costMicros,
    ).toBe(5_000_000 + 8_000_000);
  });

  it("counts every token it read and wrote", () => {
    const usage = priceUsage({ input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }, "claude-opus-5-5");
    expect(usage).toMatchObject({ inputTokens: 130, outputTokens: 7 });
    expect(usage.costMicros).toBe(Math.ceil(10 * 4 + 7 * 20 + 100 * 0.2 + 20 * 5));
  });

  it("prices each attempt at the model that ran it when a refusal fell back", () => {
    const usage = priceUsage(
      {
        input_tokens: 1000,
        output_tokens: 100,
        iterations: [
          { model: "claude-opus-5-5", input_tokens: 1000, output_tokens: 0 },
          { model: "claude-opus-4-8", input_tokens: 1000, output_tokens: 100 },
        ],
      },
      "claude-opus-4-8",
    );
    expect(usage.costMicros).toBe(1000 * 4 + (1000 * 5 + 100 * 25));
  });

  it("never reads claude-opus-5-5 as claude-opus-5, and prices unknown models high", () => {
    expect(priceUsage({ input_tokens: 1000 }, "claude-opus-5").costMicros).toBe(5000);
    expect(priceUsage({ input_tokens: 1000 }, "claude-opus-5-5-20261001").costMicros).toBe(4000);
    expect(priceUsage({ input_tokens: 1000 }, "some-new-model").costMicros).toBe(10_000);
  });
});
