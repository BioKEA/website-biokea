// Test-time stub for the cloudflare:workers virtual module. The real
// module is provided by the Cloudflare runtime / @astrojs/cloudflare's
// platformProxy in dev. Unit tests exercise handler logic directly with
// an injected env, so this stub just needs to exist; reading `env` here
// would mean the test setup is wrong.
export const env: Record<string, unknown> = {};
