/**
 * Fetch a public web page as plain text for the AI knowledge import. Server only. Guards against
 * pointing the server at itself or a private network (SSRF) and against huge or non-text responses.
 */
const MAX_BYTES = 2_000_000;
const MAX_CHARS = 30_000;

export class WebImportError extends Error {}

function isPrivateHost(host: string) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name.endsWith(".localhost") || name.endsWith(".local") || name.endsWith(".internal")) return true;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(name)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(name)) return true;
  if (name === "::1" || name.startsWith("fc") || name.startsWith("fd") || name.startsWith("fe80")) return name.includes(":");
  return false;
}

export function checkImportUrl(raw: string, allowPrivate = process.env.NODE_ENV !== "production"): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebImportError("That is not a valid link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new WebImportError("Use an http(s) link");
  if (!allowPrivate && (url.protocol !== "https:" || isPrivateHost(url.hostname))) throw new WebImportError("Use a public https:// page");
  return url;
}

/** HTML → readable text: drops scripts, styles and tags, keeps line breaks between blocks. */
export function htmlToText(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  const body = html
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  return [title, body].filter(Boolean).join("\n").slice(0, MAX_CHARS);
}

export async function fetchPageText(url: URL): Promise<string> {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
    headers: { "user-agent": "RelayBot/1.0 (+knowledge import)", accept: "text/html,text/plain" },
  });
  if (response.status >= 300 && response.status < 400) {
    const next = response.headers.get("location");
    if (!next) throw new WebImportError("The page redirected nowhere");
    // One redirect, re-checked so it cannot bounce to a private address.
    const target = checkImportUrl(new URL(next, url).toString());
    const again = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(10_000) });
    return readText(again);
  }
  return readText(response);
}

async function readText(response: Response) {
  if (!response.ok) throw new WebImportError(`The page answered ${response.status}`);
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/(html|plain)|application\/xhtml/.test(type)) throw new WebImportError("That link is not a web page");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) throw new WebImportError("That page is too large");
  const raw = (await response.text()).slice(0, MAX_BYTES);
  const text = type.includes("html") ? htmlToText(raw) : raw.slice(0, MAX_CHARS);
  if (text.trim().length < 40) throw new WebImportError("Found almost no text on that page");
  return text;
}
