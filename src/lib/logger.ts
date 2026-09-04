import { redactSecrets } from "@/lib/crypto";

function fmt(args: unknown[]) {
  return args.map((arg) => {
    if (typeof arg === "string") return redactSecrets(arg);
    if (arg instanceof Error) return redactSecrets(arg.message);
    try {
      return redactSecrets(JSON.stringify(arg));
    } catch {
      return "[unserializable]";
    }
  });
}

export const log = {
  info: (...args: unknown[]) => console.info("[relay]", ...fmt(args)),
  warn: (...args: unknown[]) => console.warn("[relay]", ...fmt(args)),
  error: (...args: unknown[]) => console.error("[relay]", ...fmt(args)),
};
