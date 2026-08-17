//
// Shopify Admin API GIDs vs. the numeric ids the Shopify Admin *web* app's
// URLs use. `quote_payments.external_id` stores the GraphQL GID
// (`gid://shopify/DraftOrder/11`); the admin dashboard link needs the
// trailing numeric id (`.../draft_orders/11`). `external_order_id` is
// already stored as a plain numeric string, so it needs no conversion —
// this helper exists only for `external_id`.
export function numericId(gid: string): string {
  const match = /\/(\d+)$/.exec(gid);
  if (!match) throw new Error(`not a Shopify GID: ${gid}`);
  return match[1];
}
