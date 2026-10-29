// src/lib/email/quote-config.ts
//
// Plain-text blocks the quote API adds to its two emails when the request
// came from the configurator (a ProjectConfig rather than bare lines). Kept
// out of the route so the wording lives in one place and stays testable.
import { summarizeConfig, type Order, type ProjectConfig } from '@/lib/pricing/order';

/** `summarizeConfig` lines, indented to sit under a heading. */
export function configLines(config: ProjectConfig): string[] {
  return summarizeConfig(config).map((l) => `  ${l}`);
}

/**
 * Everything the lab still has to settle before quoting firmly: one bullet
 * per consult trigger, then the "to be confirmed" rows that carry no price.
 * Sampling kits are both a trigger and a tbc row with the same wording, so
 * identical bullets collapse to one.
 */
export function consultBullets(order: Pick<Order, 'triggers' | 'tbc'>): string[] {
  return [
    ...new Set([
      ...order.triggers.map((t) => `- ${t.label}: ${t.detail}`),
      ...order.tbc.map((r) => `- ${r.title}: ${r.desc}`),
    ]),
  ];
}

/**
 * Replaces the pay/closing text for a consult quote. No payment link: the
 * quote is not payable until the lab replies with a firm price.
 */
export function whatHappensNext(order: Pick<Order, 'triggers' | 'tbc'>): string {
  return [
    `What happens next`,
    `We'll review the points below and reply with a firm quote and a payment link:`,
    ...consultBullets(order),
  ].join('\n');
}
