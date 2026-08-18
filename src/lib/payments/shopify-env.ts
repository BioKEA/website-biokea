// src/lib/payments/shopify-env.ts
// One place that decides "is Shopify configured on this deployment?" and
// builds the gateway config, so the deposit/balance endpoints, /api/quote's
// `paymentsEnabled`, and the quote page's offer panel can never disagree.
import type { ShopifyConfig } from './gateway';

export interface ShopifyEnv {
  SHOPIFY_STORE_DOMAIN?: string;
  SHOPIFY_ADMIN_TOKEN?: string;
  SHOPIFY_CLIENT_ID?: string;
  SHOPIFY_CLIENT_SECRET?: string;
  SHOPIFY_PAYMENT_TERMS_TEMPLATE?: string;
}

export function shopifyConfigFromEnv(e: ShopifyEnv): ShopifyConfig | null {
  if (!e.SHOPIFY_STORE_DOMAIN) return null;
  const paymentTermsTemplate = e.SHOPIFY_PAYMENT_TERMS_TEMPLATE ?? 'NET_30';
  if (e.SHOPIFY_ADMIN_TOKEN) {
    return {
      storeDomain: e.SHOPIFY_STORE_DOMAIN,
      adminToken: e.SHOPIFY_ADMIN_TOKEN,
      paymentTermsTemplate,
    };
  }
  if (e.SHOPIFY_CLIENT_ID && e.SHOPIFY_CLIENT_SECRET) {
    return {
      storeDomain: e.SHOPIFY_STORE_DOMAIN,
      clientId: e.SHOPIFY_CLIENT_ID,
      clientSecret: e.SHOPIFY_CLIENT_SECRET,
      paymentTermsTemplate,
    };
  }
  return null;
}

export const shopifyConfigured = (e: ShopifyEnv): boolean => shopifyConfigFromEnv(e) !== null;
