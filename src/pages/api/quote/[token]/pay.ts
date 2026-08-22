// src/pages/api/quote/[token]/pay.ts
//
// "Pay in full" on /quote/<token>. See src/lib/payments/pay.ts for the
// handler; this route just wires it to real Supabase + Shopify deps.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { SupabaseDb } from '@/lib/payments/db';
import { shopifyGateway } from '@/lib/payments/gateway';
import { handlePayment } from '@/lib/payments/pay';
import { shopifyConfigFromEnv, type ShopifyEnv } from '@/lib/payments/shopify-env';

export const prerender = false;

export async function POST({ request, params }: APIContext): Promise<Response> {
  const e = env as { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string } & ShopifyEnv;
  const shopify = shopifyConfigFromEnv(e);
  if (!e?.SUPABASE_URL || !e?.SUPABASE_SERVICE_ROLE_KEY || !shopify) {
    return new Response('Payments are not configured.', { status: 500 });
  }
  const token = params.token ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('Quote not found', { status: 404 });
  }
  return handlePayment(request, token, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    gateway: shopifyGateway(shopify),
  });
}
