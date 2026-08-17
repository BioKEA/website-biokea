import { describe, it, expect } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { verifyAccessJwt, accessIssuer, isAdminPath } from '@/lib/access';

const cfg = { teamDomain: 'biokea.cloudflareaccess.com', aud: 'aud-tag-123' };

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'k1';
  jwk.alg = 'RS256';
  return { privateKey, getKey: createLocalJWKSet({ keys: [jwk] }) };
}
async function token(
  privateKey: CryptoKey,
  over: { iss?: string; aud?: string; exp?: string; email?: string } = {},
) {
  const jwt = new SignJWT({ email: over.email ?? 'sean@biokea.ai', type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setIssuer(over.iss ?? accessIssuer(cfg.teamDomain))
    .setAudience(over.aud ?? cfg.aud)
    .setExpirationTime(over.exp ?? '10m');
  return jwt.sign(privateKey);
}

describe('verifyAccessJwt', () => {
  it('returns the email for a valid Access JWT', async () => {
    const { privateKey, getKey } = await keys();
    expect(await verifyAccessJwt(await token(privateKey), cfg, getKey)).toBe('sean@biokea.ai');
  });

  it('rejects wrong audience, wrong issuer, expired, and missing email', async () => {
    const { privateKey, getKey } = await keys();
    await expect(
      verifyAccessJwt(await token(privateKey, { aud: 'other' }), cfg, getKey),
    ).rejects.toThrow();
    await expect(
      verifyAccessJwt(
        await token(privateKey, { iss: 'https://evil.cloudflareaccess.com' }),
        cfg,
        getKey,
      ),
    ).rejects.toThrow();
    await expect(
      verifyAccessJwt(await token(privateKey, { exp: '-1m' }), cfg, getKey),
    ).rejects.toThrow();
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(accessIssuer(cfg.teamDomain))
      .setAudience(cfg.aud)
      .setExpirationTime('10m')
      .sign(privateKey);
    await expect(verifyAccessJwt(noEmail, cfg, getKey)).rejects.toThrow(/email/);
  });

  it('rejects a token signed by another key', async () => {
    const a = await keys();
    const b = await keys();
    await expect(verifyAccessJwt(await token(b.privateKey), cfg, a.getKey)).rejects.toThrow();
  });
});

describe('isAdminPath', () => {
  it('matches /admin, /admin/…, /api/admin/… and nothing else', () => {
    for (const p of ['/admin', '/admin/', '/admin/quotes/BK-1', '/api/admin/quotes/BK-1/balance'])
      expect(isAdminPath(p)).toBe(true);
    for (const p of ['/', '/administrator', '/api/quote', '/adminx', '/quote/admin'])
      expect(isAdminPath(p)).toBe(false);
  });
});
