//
// The one thing we ask the payments provider to do: turn a list of lines
// into a sent, hosted invoice for a customer. Both the deposit and the
// balance go through createInvoice(); the callers only differ in what
// lines and metadata they pass. Spec §5.1.
import type { InvoiceLineSpec, PaymentKind } from './types';

export interface InvoiceCustomer {
  id: string | null; // existing external customer id, or null to create one
  email: string;
  name: string;
  organization: string | null;
  quoteId: string;
}

export interface CreateInvoiceSpec {
  customer: InvoiceCustomer;
  kind: PaymentKind;
  quoteId: string;
  quoteNumber: string;
  paymentId: string; // the quote_payments row id — the gateway's idempotency + webhook lookup key
  poNumber: string | null;
  lines: InvoiceLineSpec[]; // amountCents always >= 0
  credit?: { title: string; amountCents: number }; // deposit credit on the balance invoice
  footer: string;
  daysUntilDue: number;
}

export interface CreatedInvoice {
  customerId: string | null;
  externalId: string;
  number: string | null;
  hostedUrl: string;
  pdfUrl: string | null;
  dueAt: string | null;
  amountDueCents: number;
}

export interface PaymentsGateway {
  createInvoice(spec: CreateInvoiceSpec): Promise<CreatedInvoice>;
}

export interface ShopifyConfig {
  storeDomain: string; // biokea.myshopify.com
  // Either a static Admin API access token (legacy custom app, `shpat_…`) or
  // the app's client credentials (Dev Dashboard app installed on our own
  // store), from which the Worker mints 24-hour tokens on demand.
  adminToken?: string;
  clientId?: string;
  clientSecret?: string;
  apiVersion?: string; // default '2026-01'
  paymentTermsTemplate?: string; // 'NET_30' etc.; undefined → due on receipt
}

// Client-credentials tokens live 24 h; cache them per isolate and re-mint a
// little before expiry. Keyed by store + client id.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
export function resetShopifyTokenCache(): void {
  tokenCache.clear();
}

async function mintToken(cfg: ShopifyConfig, fetchImpl: typeof fetch): Promise<string> {
  const key = `${cfg.storeDomain}|${cfg.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) return cached.token;
  const res = await fetchImpl(`https://${cfg.storeDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      grant_type: 'client_credentials',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Shopify /admin/oauth/access_token ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token)
    throw new Error('Shopify /admin/oauth/access_token: no access_token in response');
  const ttlMs = (json.expires_in ?? 86399) * 1000;
  tokenCache.set(key, { token: json.access_token, expiresAt: Date.now() + ttlMs });
  return json.access_token;
}

async function accessToken(cfg: ShopifyConfig, fetchImpl: typeof fetch): Promise<string> {
  if (cfg.adminToken) return cfg.adminToken;
  if (cfg.clientId && cfg.clientSecret) return mintToken(cfg, fetchImpl);
  throw new Error('Shopify credentials missing: need adminToken or clientId + clientSecret');
}

export const dollars = (cents: number): string => {
  if (!Number.isInteger(cents)) throw new Error(`amount must be integer cents, got ${cents}`);
  return (cents / 100).toFixed(2);
};

export async function shopifyGraphql<T>(
  cfg: ShopifyConfig,
  query: string,
  variables: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const url = `https://${cfg.storeDomain}/admin/api/${cfg.apiVersion ?? '2026-01'}/graphql.json`;
  const call = async (token: string) =>
    fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
  let res = await call(await accessToken(cfg, fetchImpl));
  // A minted token can be revoked early (app reinstalled); drop the cache
  // and retry exactly once with a fresh one.
  if (res.status === 401 && cfg.clientId && !cfg.adminToken) {
    tokenCache.delete(`${cfg.storeDomain}|${cfg.clientId}`);
    res = await call(await accessToken(cfg, fetchImpl));
  }
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length)
    throw new Error(`Shopify GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  return json.data as T;
}

const Q_TEMPLATES = `query paymentTermsTemplates { paymentTermsTemplates { id name paymentTermsType dueInDays } }`;
const Q_FIND = `query findDraft($query: String!) { draftOrders(first: 10, query: $query) { nodes { id name status } } }`;
const M_CREATE = `mutation draftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name } userErrors { field message } } }`;
const M_SEND = `mutation draftOrderInvoiceSend($id: ID!) { draftOrderInvoiceSend(id: $id) { draftOrder { id name invoiceUrl totalPriceSet { shopMoney { amount } } paymentTerms { paymentSchedules(first: 1) { nodes { dueAt } } } } userErrors { field message } } }`;

const userErr = (errs: { message: string }[] | undefined, what: string) => {
  if (errs && errs.length) throw new Error(`${what}: ${errs.map((e) => e.message).join('; ')}`);
};

// GraphQL Admin API Draft Orders implementation. Creates (or reuses, keyed
// on the payment:<paymentId> tag) a Draft Order and sends the hosted
// invoice. Spec §5.1.
export function shopifyGateway(
  cfg: ShopifyConfig,
  fetchImpl: typeof fetch = fetch,
): PaymentsGateway {
  let templateId: string | null | undefined; // undefined = not looked up yet
  async function termsTemplateId(): Promise<string | null> {
    if (!cfg.paymentTermsTemplate) return null;
    if (templateId !== undefined) return templateId;
    try {
      const d = await shopifyGraphql<{
        paymentTermsTemplates: {
          id: string;
          name: string;
          paymentTermsType: string;
          dueInDays: number | null;
        }[];
      }>(cfg, Q_TEMPLATES, {}, fetchImpl);
      const want = cfg.paymentTermsTemplate.toUpperCase(); // NET_30
      const days = Number(want.split('_')[1]);
      const hit =
        d.paymentTermsTemplates.find((t) => t.paymentTermsType === 'NET' && t.dueInDays === days) ??
        null;
      templateId = hit?.id ?? null;
    } catch {
      templateId = null; // due on receipt; never block an invoice on terms lookup
    }
    return templateId;
  }

  return {
    async createInvoice(spec) {
      const terms = await termsTemplateId();
      const found = await shopifyGraphql<{
        draftOrders: { nodes: { id: string; name: string; status: string }[] };
      }>(cfg, Q_FIND, { query: `tag:"payment:${spec.paymentId}"` }, fetchImpl);
      let draft = found.draftOrders.nodes.find((n) => n.status === 'OPEN') ?? null;
      if (!draft) {
        const attrs = [
          { key: 'quote_id', value: spec.quoteId },
          { key: 'quote_number', value: spec.quoteNumber },
          { key: 'kind', value: spec.kind },
          { key: 'payment_id', value: spec.paymentId },
        ];
        if (spec.poNumber) attrs.push({ key: 'po_number', value: spec.poNumber });
        const input: Record<string, unknown> = {
          email: spec.customer.email,
          note: spec.footer,
          taxExempt: true,
          tags: ['biokea', spec.kind, `payment:${spec.paymentId}`, `quote:${spec.quoteNumber}`],
          customAttributes: attrs,
          lineItems: spec.lines.map((l) => ({
            title: l.description,
            quantity: 1,
            originalUnitPrice: dollars(l.amountCents),
            taxable: false,
            requiresShipping: false,
          })),
        };
        if (spec.credit)
          input.appliedDiscount = {
            title: spec.credit.title,
            description: spec.credit.title,
            value: Number(dollars(spec.credit.amountCents)),
            valueType: 'FIXED_AMOUNT',
          };
        // Net terms only when the buyer supplied a PO number (spec §2);
        // self-serve drafts are due on receipt so the invoice URL forces
        // payment.
        if (terms && spec.poNumber) input.paymentTerms = { paymentTermsTemplateId: terms };
        const c = await shopifyGraphql<{
          draftOrderCreate: {
            draftOrder: { id: string; name: string } | null;
            userErrors: { message: string }[];
          };
        }>(cfg, M_CREATE, { input }, fetchImpl);
        userErr(c.draftOrderCreate.userErrors, 'draftOrderCreate');
        draft = { ...c.draftOrderCreate.draftOrder!, status: 'OPEN' };
      }
      const s = await shopifyGraphql<{
        draftOrderInvoiceSend: {
          draftOrder: {
            id: string;
            name: string;
            invoiceUrl: string;
            totalPriceSet: { shopMoney: { amount: string } };
            paymentTerms: { paymentSchedules: { nodes: { dueAt: string | null }[] } } | null;
          };
          userErrors: { message: string }[];
        };
      }>(cfg, M_SEND, { id: draft.id }, fetchImpl);
      userErr(s.draftOrderInvoiceSend.userErrors, 'draftOrderInvoiceSend');
      const d = s.draftOrderInvoiceSend.draftOrder;
      return {
        customerId: null,
        externalId: d.id,
        number: d.name,
        hostedUrl: d.invoiceUrl,
        pdfUrl: null,
        dueAt: d.paymentTerms?.paymentSchedules.nodes[0]?.dueAt ?? null,
        amountDueCents: Math.round(Number(d.totalPriceSet.shopMoney.amount) * 100),
      };
    },
  };
}

// Test double: records every spec, hands back deterministic ids.
export class MemoryGateway implements PaymentsGateway {
  created: CreateInvoiceSpec[] = [];
  failNext?: Error;
  private seq = 0;
  async createInvoice(spec: CreateInvoiceSpec): Promise<CreatedInvoice> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = undefined;
      throw err;
    }
    this.created.push(spec);
    const n = ++this.seq;
    return {
      customerId: null,
      externalId: `gid://shopify/DraftOrder/test-${n}`,
      number: `#D${n}`,
      hostedUrl: `https://store.biokea.test/invoices/test-${n}`,
      pdfUrl: null,
      dueAt: '2026-10-01T00:00:00.000Z',
      amountDueCents:
        spec.lines.reduce((s, l) => s + l.amountCents, 0) - (spec.credit?.amountCents ?? 0),
    };
  }
}
