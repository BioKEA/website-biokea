// src/lib/access.ts
//
// Verifies the JWT Cloudflare Access puts on every request that passed
// its policy (header Cf-Access-Jwt-Assertion). Access already blocked
// unauthenticated users at the edge; this is defence in depth so a
// misconfigured or deleted Access app can never expose /admin. Spec §5.4.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AccessConfig {
  teamDomain: string; // e.g. biokea.cloudflareaccess.com
  aud: string; // Access application "Application Audience (AUD) Tag"
}

export const ADMIN_PREFIXES = ['/admin', '/api/admin'] as const;

export function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function accessIssuer(teamDomain: string): string {
  return `https://${teamDomain}`;
}

// Module-level so the JWKS is cached across requests within an isolate.
const keySets = new Map<string, JWTVerifyGetKey>();
export function remoteAccessKeys(teamDomain: string): JWTVerifyGetKey {
  let ks = keySets.get(teamDomain);
  if (!ks) {
    ks = createRemoteJWKSet(new URL(`${accessIssuer(teamDomain)}/cdn-cgi/access/certs`));
    keySets.set(teamDomain, ks);
  }
  return ks;
}

export async function verifyAccessJwt(
  token: string,
  cfg: AccessConfig,
  getKey: JWTVerifyGetKey,
): Promise<string> {
  const { payload } = await jwtVerify(token, getKey, {
    issuer: accessIssuer(cfg.teamDomain),
    audience: cfg.aud,
    algorithms: ['RS256'],
  });
  const email = payload.email;
  if (typeof email !== 'string' || email.length === 0)
    throw new Error('Access JWT has no email claim');
  return email;
}
