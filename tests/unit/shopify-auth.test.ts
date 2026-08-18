import { describe, it, expect, beforeEach } from 'vitest';
import { shopifyGraphql, resetShopifyTokenCache, type ShopifyConfig } from '@/lib/payments/gateway';
import { shopifyConfigFromEnv, shopifyConfigured } from '@/lib/payments/shopify-env';

function fakeFetch(handlers: { token?: () => Response; graphql?: (n: number) => Response }) {
  const calls: { url: string; init: RequestInit }[] = [];
  let gqlN = 0;
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith('/admin/oauth/access_token')) return handlers.token!();
    gqlN++;
    return handlers.graphql!(gqlN);
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
const okToken = (t = 'shpua_1', expires = 86399) =>
  new Response(
    JSON.stringify({ access_token: t, scope: 'write_draft_orders', expires_in: expires }),
    { status: 200 },
  );
const okGql = () =>
  new Response(JSON.stringify({ data: { shop: { name: 'BioKEA' } } }), { status: 200 });

const cc: ShopifyConfig = {
  storeDomain: 'biokea.myshopify.com',
  clientId: 'cid_1',
  clientSecret: 'shpss_1',
};

beforeEach(() => resetShopifyTokenCache());

describe('shopifyGraphql with client credentials', () => {
  it('mints a token with a form-encoded POST, then uses it as X-Shopify-Access-Token', async () => {
    const s = fakeFetch({ token: () => okToken(), graphql: okGql });
    const data = await shopifyGraphql<{ shop: { name: string } }>(
      cc,
      'query shop { shop { name } }',
      {},
      s.fetch,
    );
    expect(data.shop.name).toBe('BioKEA');
    expect(s.calls[0].url).toBe('https://biokea.myshopify.com/admin/oauth/access_token');
    expect(s.calls[0].init.method).toBe('POST');
    expect((s.calls[0].init.headers as Record<string, string>)['content-type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(String(s.calls[0].init.body)).toBe(
      'client_id=cid_1&client_secret=shpss_1&grant_type=client_credentials',
    );
    expect((s.calls[1].init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe(
      'shpua_1',
    );
  });

  it('caches the token across calls for the same store + client', async () => {
    const s = fakeFetch({ token: () => okToken(), graphql: okGql });
    await shopifyGraphql(cc, 'query a { shop { name } }', {}, s.fetch);
    await shopifyGraphql(cc, 'query b { shop { name } }', {}, s.fetch);
    expect(s.calls.filter((c) => c.url.endsWith('/access_token'))).toHaveLength(1);
  });

  it('re-mints when the cached token is about to expire', async () => {
    const s = fakeFetch({ token: () => okToken('shpua_short', 60), graphql: okGql });
    await shopifyGraphql(cc, 'query a { shop { name } }', {}, s.fetch);
    await shopifyGraphql(cc, 'query b { shop { name } }', {}, s.fetch);
    expect(s.calls.filter((c) => c.url.endsWith('/access_token'))).toHaveLength(2);
  });

  it('drops the cache and retries once when Shopify answers 401', async () => {
    let tokens = 0;
    const s = fakeFetch({
      token: () => okToken(`shpua_${++tokens}`),
      graphql: (n) => (n === 1 ? new Response('unauthorized', { status: 401 }) : okGql()),
    });
    const data = await shopifyGraphql<{ shop: { name: string } }>(
      cc,
      'query shop { shop { name } }',
      {},
      s.fetch,
    );
    expect(data.shop.name).toBe('BioKEA');
    expect(tokens).toBe(2);
    const gqlHeaders = s.calls
      .filter((c) => c.url.includes('/graphql.json'))
      .map((c) => (c.init.headers as Record<string, string>)['X-Shopify-Access-Token']);
    expect(gqlHeaders).toEqual(['shpua_1', 'shpua_2']);
  });

  it('throws a clear error when the token endpoint rejects the credentials', async () => {
    const s = fakeFetch({
      token: () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }),
      graphql: okGql,
    });
    await expect(shopifyGraphql(cc, 'query shop { shop { name } }', {}, s.fetch)).rejects.toThrow(
      /access_token.*401|401.*access_token/,
    );
  });

  it('still works with a static admin token and never calls the token endpoint', async () => {
    const s = fakeFetch({ token: () => okToken(), graphql: okGql });
    await shopifyGraphql(
      { storeDomain: 'biokea.myshopify.com', adminToken: 'shpat_x' },
      'query shop { shop { name } }',
      {},
      s.fetch,
    );
    expect(s.calls).toHaveLength(1);
    expect((s.calls[0].init.headers as Record<string, string>)['X-Shopify-Access-Token']).toBe(
      'shpat_x',
    );
  });

  it('refuses a config with neither credential', async () => {
    await expect(
      shopifyGraphql(
        { storeDomain: 'biokea.myshopify.com' } as ShopifyConfig,
        'query shop { shop { name } }',
        {},
        fakeFetch({}).fetch,
      ),
    ).rejects.toThrow(/credentials/i);
  });
});

describe('shopifyConfigFromEnv', () => {
  it('returns null unless the domain plus one credential form is present', () => {
    expect(shopifyConfigFromEnv({})).toBeNull();
    expect(shopifyConfigFromEnv({ SHOPIFY_STORE_DOMAIN: 'biokea.myshopify.com' })).toBeNull();
    expect(
      shopifyConfigFromEnv({
        SHOPIFY_STORE_DOMAIN: 'biokea.myshopify.com',
        SHOPIFY_CLIENT_ID: 'cid',
      }),
    ).toBeNull();
    expect(
      shopifyConfigFromEnv({
        SHOPIFY_STORE_DOMAIN: 'biokea.myshopify.com',
        SHOPIFY_ADMIN_TOKEN: 'shpat_x',
        SHOPIFY_PAYMENT_TERMS_TEMPLATE: 'NET_30',
      }),
    ).toEqual({
      storeDomain: 'biokea.myshopify.com',
      adminToken: 'shpat_x',
      paymentTermsTemplate: 'NET_30',
    });
    expect(
      shopifyConfigFromEnv({
        SHOPIFY_STORE_DOMAIN: 'biokea.myshopify.com',
        SHOPIFY_CLIENT_ID: 'cid',
        SHOPIFY_CLIENT_SECRET: 'shpss',
      }),
    ).toEqual({
      storeDomain: 'biokea.myshopify.com',
      clientId: 'cid',
      clientSecret: 'shpss',
      paymentTermsTemplate: 'NET_30',
    });
    expect(
      shopifyConfigured({
        SHOPIFY_STORE_DOMAIN: 'biokea.myshopify.com',
        SHOPIFY_CLIENT_ID: 'cid',
        SHOPIFY_CLIENT_SECRET: 'shpss',
      }),
    ).toBe(true);
    expect(shopifyConfigured({})).toBe(false);
  });
});
