// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) — faqat WebCrypto, tashqi kutubxonasiz.
const te = new TextEncoder();

export function b64uDecode(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
export function b64uEncode(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

export async function encryptPayload(plaintext: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array,
                                     asKeys?: CryptoKeyPair, salt?: Uint8Array): Promise<Uint8Array> {
  const kp = asKeys ?? (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, kp.privateKey, 256));
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(te.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1])));
  const prk = await hmac(s, ikm);
  const cek = (await hmac(prk, concat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(s, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ct);
}

export class Vapid {
  cache = new Map<string, { exp: number; jwt: string }>();
  key: CryptoKey;
  publicB64: string;
  subject: string;
  constructor(key: CryptoKey, publicB64: string, subject: string) {
    this.key = key;
    this.publicB64 = publicB64;
    this.subject = subject;
  }
  static async fromJwk(jwk: JsonWebKey, publicB64: string, subject: string): Promise<Vapid> {
    const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: jwk.d, x: jwk.x, y: jwk.y, ext: true },
      { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    return new Vapid(key, publicB64, subject);
  }
  async jwt(endpoint: string): Promise<string> {
    const aud = new URL(endpoint).origin;
    const now = Math.floor(Date.now() / 1000);
    const c = this.cache.get(aud);
    if (c && c.exp > now + 600) return c.jwt;
    const exp = now + 3600;
    const enc = (o: unknown) => b64uEncode(te.encode(JSON.stringify(o)));
    const input = `${enc({ typ: "JWT", alg: "ES256" })}.${enc({ aud, exp, sub: this.subject })}`;
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.key, te.encode(input)));
    const jwt = `${input}.${b64uEncode(sig)}`;
    this.cache.set(aud, { exp, jwt });
    return jwt;
  }
}

export interface Sub { endpoint: string; p256dh: string; auth: string }

export async function sendWebPush(v: Vapid, sub: Sub, payload: unknown, urgency = "normal", ttl = 3600): Promise<number> {
  const body = await encryptPayload(te.encode(JSON.stringify(payload)), b64uDecode(sub.p256dh), b64uDecode(sub.auth));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", TTL: String(ttl), Urgency: urgency,
      Authorization: `vapid t=${await v.jwt(sub.endpoint)}, k=${v.publicB64}`,
    },
    body,
  });
  if (res.status >= 400) console.warn("push", res.status, (await res.text()).slice(0, 200));
  else await res.body?.cancel();
  return res.status;
}
