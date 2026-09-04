import { telegramSendsPerSecond } from "@/lib/env";
import { incrWithTtl, getTtlValue, setTtlValue } from "@/lib/redis";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function acquireSendSlot(botId: string, chatId: string): Promise<void> {
  const budget = telegramSendsPerSecond();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const windowKey = `relay:rl:${botId}:${Math.floor(Date.now() / 1000)}`;
    const count = await incrWithTtl(windowKey, 2);
    const lastKey = `relay:rlchat:${botId}:${chatId}`;
    const last = await getTtlValue(lastKey);
    const minGapMs = 50;
    const since = last ? Date.now() - Number(last) : minGapMs;
    if (count <= budget && since >= minGapMs) {
      await setTtlValue(lastKey, String(Date.now()), 10);
      return;
    }
    await sleep(80);
  }
  throw new Error("Telegram send rate limit exceeded — retry shortly");
}
