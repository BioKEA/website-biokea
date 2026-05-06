// src/lib/golden-sample/hmac.ts
//
// HMAC-SHA256 token signing for Golden Sample tickets. The token is
// what /golden-sample-26 validates at redemption time — the *word* is
// not load-bearing; the signed token is. So even if a player shares a
// screenshot of "Golden Sample 1 of 6 · EVERY", that doesn't let
// anyone else claim slot 1 — they need the matching signed token, and
// the token only issues to a handle that actually completed the
// unlock.
//
// Tokens are short-lived in spirit (campaign window is ~60 days) but
// don't carry an explicit expiry — `issued_at` is checked against the
// campaign close at redemption time.
//
// Token wire format:
//   <base64url(payload-json)>.<base64url(hmac-sha256(payload-json))>
//
// Payload is JSON: { game, slot, handle, client_id, issued_at }.

export interface TicketPayload {
  game: string;
  slot: number;
  handle: string;
  client_id: string;
  // ISO-8601 UTC.
  issued_at: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signTicket(payload: TicketPayload, secret: string): Promise<string> {
  const key = await importKey(secret);
  const json = JSON.stringify(payload);
  const data = new TextEncoder().encode(json);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  return `${toBase64Url(data)}.${toBase64Url(sig)}`;
}

export async function verifyTicket(token: string, secret: string): Promise<TicketPayload | null> {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const b64Payload = token.slice(0, dot);
  const b64Sig = token.slice(dot + 1);
  let payloadBytes: Uint8Array;
  let sig: Uint8Array;
  try {
    payloadBytes = fromBase64Url(b64Payload);
    sig = fromBase64Url(b64Sig);
  } catch {
    return null;
  }
  const key = await importKey(secret);
  const ok = await crypto.subtle.verify('HMAC', key, sig, payloadBytes);
  if (!ok) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as TicketPayload;
    if (
      typeof parsed.game !== 'string' ||
      typeof parsed.slot !== 'number' ||
      typeof parsed.handle !== 'string' ||
      typeof parsed.client_id !== 'string' ||
      typeof parsed.issued_at !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
