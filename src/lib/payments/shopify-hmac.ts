//
// Shopify webhook auth: base64(HMAC-SHA256(raw body, SHOPIFY_WEBHOOK_SECRET))
// in the X-Shopify-Hmac-Sha256 header, WebCrypto only (no node:crypto — this
// runs on Workers). Compared in constant time. Spec §4.4.
const enc = new TextEncoder();

export async function shopifyHmacBase64(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function verifyShopifyHmac(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const expected = await shopifyHmacBase64(rawBody, secret);
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}
