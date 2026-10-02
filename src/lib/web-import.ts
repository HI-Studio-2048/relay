import { lookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

/**
 * Fetch a public web page as plain text for the AI knowledge import. Server only.
 *
 * SSRF guard: the host name is resolved and every address must be public unicast; the connection is
 * made to the address that was checked (custom lookup), so a DNS answer cannot change in between.
 * The body is streamed with a hard byte cap. Outside production, private addresses are allowed so a
 * local page can be imported while developing.
 */
const MAX_BYTES = 2_000_000;
const MAX_CHARS = 30_000;

export class WebImportError extends Error {}

function ipv4Parts(ip: string) {
  return ip.split(".").map(Number);
}

/** Public unicast only: no loopback, private, link-local, CGNAT, metadata, multicast or reserved ranges. */
export function isPublicAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]!;
  if (isIP(ip) === 4) {
    const [a, b, c] = ipv4Parts(ip) as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT, incl. 100.100.100.200 metadata
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (isIP(ip) === 6) {
    const groups = expandIpv6(ip);
    if (!groups) return false;
    if (groups.every((group) => group === 0)) return false; // ::
    if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return false; // ::1
    // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::a.b.c.d): judge the IPv4 inside.
    const embedded = `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
    if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0xffff || groups[5] === 0)) return isPublicAddress(embedded);
    if (groups[0] === 0x64 && groups[1] === 0xff9b) return isPublicAddress(embedded);
    const first = groups[0]!;
    if ((first & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return false; // link / site local
    if ((first & 0xff00) === 0xff00) return false; // multicast
    if (first === 0x2001 && groups[1] === 0xdb8) return false; // documentation
    return (first & 0xe000) === 0x2000; // only global unicast 2000::/3
  }
  return false;
}

function expandIpv6(ip: string): number[] | null {
  let text = ip;
  const v4 = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = ipv4Parts(v4[1]!);
    text = text.slice(0, -v4[1]!.length) + `${((a! << 8) | b!).toString(16)}:${((c! << 8) | d!).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail !== undefined && tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (text.includes("::") ? missing < 0 : left.length !== 8) return null;
  const groups = [...left, ...Array(text.includes("::") ? missing : 0).fill("0"), ...right].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isFinite(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

export function checkImportUrl(raw: string, allowPrivate = process.env.NODE_ENV !== "production"): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new WebImportError("That is not a valid link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new WebImportError("Use an http(s) link");
  if (url.username || url.password) throw new WebImportError("Links with a login are not supported");
  if (!allowPrivate) {
    if (url.protocol !== "https:") throw new WebImportError("Use a public https:// page");
    const host = url.hostname.replace(/\.$/, "").toLowerCase();
    if (!host || host === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(host)) throw new WebImportError("Use a public https:// page");
    if (isIP(host.replace(/^\[|\]$/g, "")) && !isPublicAddress(host)) throw new WebImportError("Use a public https:// page");
  }
  return url;
}

/** DNS lookup that refuses non-public answers; used as the socket's lookup so the checked IP is the one dialled. */
function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "", 4);
      const list = addresses as unknown as { address: string; family: number }[];
      const bad = list.find((entry) => !isPublicAddress(entry.address));
      if (!allowPrivate && (list.length === 0 || bad)) {
        return callback(new WebImportError("That address is not public") as NodeJS.ErrnoException, "", 4);
      }
      const first = list[0]!;
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
      callback(null, first.address, first.family);
    });
  };
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

type Fetched = { status: number; location: string | null; type: string; body: string };

function getOnce(url: URL, allowPrivate: boolean): Promise<Fetched> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(
      url,
      {
        lookup: guardedLookup(allowPrivate),
        timeout: 10_000,
        headers: { "user-agent": "RelayBot/1.0 (+knowledge import)", accept: "text/html,text/plain" },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const type = String(response.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          response.resume();
          return resolve({ status, location: response.headers.location ?? null, type, body: "" });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            request.destroy(new WebImportError("That page is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, location: null, type, body: Buffer.concat(chunks).toString("utf8") }));
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new WebImportError("That page took too long to answer")));
    request.on("error", (error) => reject(error instanceof WebImportError ? error : new WebImportError("Could not reach that page")));
  });
}

export async function fetchPageText(url: URL, allowPrivate = process.env.NODE_ENV !== "production"): Promise<string> {
  let target = url;
  let page = await getOnce(target, allowPrivate);
  if (page.status >= 300 && page.status < 400) {
    if (!page.location) throw new WebImportError("The page redirected nowhere");
    // One redirect, checked again (URL rules and DNS) so it cannot bounce somewhere private.
    target = checkImportUrl(new URL(page.location, target).toString(), allowPrivate);
    page = await getOnce(target, allowPrivate);
    if (page.status >= 300 && page.status < 400) throw new WebImportError("The page redirected too many times");
  }
  if (page.status < 200 || page.status >= 300) throw new WebImportError(`The page answered ${page.status}`);
  if (!/text\/(html|plain)|application\/xhtml/.test(page.type)) throw new WebImportError("That link is not a web page");
  const text = page.type.includes("html") ? htmlToText(page.body) : page.body.slice(0, MAX_CHARS);
  if (text.trim().length < 40) throw new WebImportError("Found almost no text on that page");
  return text;
}
