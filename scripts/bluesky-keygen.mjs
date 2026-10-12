// Makes the signing key for "Sign in with Bluesky". Run it once: node scripts/bluesky-keygen.mjs
// Put the printed line into Railway as BLUESKY_OAUTH_KEY. It is a secret: keep it out of the repo and out of chat.
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const jwk = privateKey.export({ format: "jwk" });
const key = { ...jwk, kid: `recatch-${randomBytes(6).toString("hex")}`, alg: "ES256" };

console.log("Set this as BLUESKY_OAUTH_KEY (one line, keep it secret):\n");
console.log(JSON.stringify(key));
