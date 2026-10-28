// src/widget/template.ts
//
// Pure markup for the order configurator. Every function here returns a
// string and touches no DOM, so the whole surface is unit-testable and the
// same strings render on the site, on the Shopify store, or in a test. The
// `data-*` hooks are contractual — quote-widget.ts and the e2e suite address
// the widget through them, so they must not drift. Styling is the `.bk-*`
// class set in quote.css (no Tailwind: the bundle has to look right on a
// Shopify theme too).
//
// Layout, top to bottom: service menu, rate, the chosen service's branch,
// directions for the lab, the draft quote panel (re-rendered whole by the
// controller via renderQuotePanel), then the details form and the hidden
// hand-off form, which live outside the panel so re-rendering it never
// wipes what the customer has typed.
import { serviceChoices } from '@/data/configurator';
import type { Order } from '@/lib/pricing/order';
import {
  nextTierUpsell,
  type Audience,
  type PriceResult,
  type Quote,
  type QuoteLine,
} from '@/lib/pricing/quote';
import { branches } from './branches';
import { esc, fieldset } from './html';

export { esc };

export interface WidgetTemplateOptions {
  turnstileSiteKey?: string;
}

export const usd = (n: number): string => '$' + n.toLocaleString('en-US');

/** Per-unit rates can carry cents (0.75 × $5 for id-only extra markers). */
const rate = (n: number): string =>
  Number.isInteger(n) ? usd(n) : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2 });

const plural = (n: number, unit: string): string =>
  `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;

/** The status pill copy, one per panel state. `requested` is for the
 * controller to swap in once a consultation request has gone through. */
export const STATUS_PILLS = {
  ready: 'Ready for checkout',
  consult: 'Consultation needed before payment',
  custom: 'Custom quote after consultation',
  requested: 'Consultation requested',
} as const;

/** The text the controller writes into `[data-error-for=field]`. */
export function renderError(_field: string, msg: string): string {
  return esc(msg);
}

// ── the configurator shell ────────────────────────────────────────────

function serviceStep(): string {
  const cards = serviceChoices
    .map(
      (s) => `<label class="bk-choice bk-choice--card">
          <input type="radio" name="bk-service" value="${esc(s.slug)}" data-service-choice="${esc(s.slug)}" />
          <span class="bk-choice-text">
            <span class="bk-choice-title">${esc(s.title)}</span>
            <span class="bk-choice-desc">${esc(s.tagline)}</span>
            <span class="bk-choice-price">${esc(s.priceLine)}</span>
          </span>
        </label>`,
    )
    .join('\n        ');
  return fieldset(
    'Service',
    `<div class="bk-choices bk-choices--2">
        ${cards}
        </div>`,
    'data-step="service"',
  );
}

/** Commercial is the default: we never headline a rate the visitor may not
 * be eligible for. */
function audienceStep(): string {
  return fieldset(
    'Pricing',
    `<div class="bk-choices bk-choices--2">
        <label class="bk-choice">
          <input type="radio" name="bk-audience" value="commercial" data-audience-toggle="commercial" checked />
          <span class="bk-choice-text"><span class="bk-choice-title">Commercial</span></span>
        </label>
        <label class="bk-choice">
          <input type="radio" name="bk-audience" value="academic" data-audience-toggle="academic" />
          <span class="bk-choice-text"><span class="bk-choice-title">Academic or nonprofit</span></span>
        </label>
        </div>`,
    'data-step="audience"',
  );
}

function branchBlocks(): string {
  return serviceChoices
    .map(
      (s) => `<div class="bk-branch" data-branch="${esc(s.slug)}" hidden>
      ${branches[s.slug]()}
    </div>`,
    )
    .join('\n    ');
}

/** Hidden until a service is chosen; part of the configuration. The label
 * doubles as the step heading, so the fieldset needs no separate legend. */
function directionsStep(): string {
  return `<fieldset class="bk-fieldset" data-step="directions" hidden>
      <label class="bk-step-legend" for="bk-directions">Specific directions for the lab (optional)</label>
      <textarea id="bk-directions" data-field="directions" maxlength="2000" rows="3" class="bk-input bk-input--block" placeholder="Anything we should know about your samples or how you want them handled"></textarea>
    </fieldset>`;
}

function detailsForm(turnstileSiteKey?: string): string {
  const turnstile = turnstileSiteKey
    ? `\n    <div class="cf-turnstile" data-sitekey="${esc(turnstileSiteKey)}" data-size="flexible"></div>`
    : '';
  return `<form data-details-form hidden class="bk-form" novalidate>
    <label class="bk-field-label">
      <span class="bk-legend">Name</span>
      <input required id="quote-name" name="name" type="text" autocomplete="name" class="bk-input bk-input--block" />
    </label>
    <label class="bk-field-label">
      <span class="bk-legend">Email</span>
      <input required id="quote-email" name="email" type="email" autocomplete="email" class="bk-input bk-input--block" />
    </label>
    <label class="bk-field-label">
      <span class="bk-legend">Organization (optional)</span>
      <input id="quote-org" name="organization" type="text" autocomplete="organization" class="bk-input bk-input--block" />
    </label>
    <label class="bk-field-label bk-attest" data-attest-field hidden>
      <input type="checkbox" name="attest" value="true" />
      <span>
        Required for the academic rate: this work is for a degree-granting institution,
        government agency, or non-profit research organization.
      </span>
    </label>
    <label class="bk-field-label" data-po-field hidden>
      <span class="bk-legend">PO number (optional — printed on the invoice)</span>
      <input name="po_number" maxlength="64" class="bk-input bk-input--block" />
    </label>
    <input type="text" name="website" tabindex="-1" autocomplete="off" class="bk-hp" aria-hidden="true" />${turnstile}
    <button type="submit" class="bk-btn bk-btn--teal bk-btn--block">Send my quote →</button>
    <p data-quote-status role="status" aria-live="polite" class="bk-status"></p>
  </form>`;
}

const HANDOFF_FORM = `<form method="post" data-handoff-form hidden aria-hidden="true">
    <input type="hidden" name="audience" />
    <input type="hidden" name="attest" />
    <input type="hidden" name="intent" />
    <input type="hidden" name="po_number" />
  </form>`;

/** The whole widget: a single column of steps, then the draft quote. */
export function renderWidgetHtml(opts: WidgetTemplateOptions = {}): string {
  return `
<div class="bk-quote">
  <div class="bk-steps">
    ${serviceStep()}
    ${audienceStep()}
    ${branchBlocks()}
    ${directionsStep()}
    <p data-form-status class="bk-form-status" role="status" aria-live="polite" hidden></p>
  </div>

  <section data-quote-panel class="bk-panel" aria-label="Your draft quote" hidden></section>

  ${detailsForm(opts.turnstileSiteKey)}

  ${HANDOFF_FORM}
</div>`;
}

// ── the draft quote panel ─────────────────────────────────────────────

function tierText(l: QuoteLine, price: PriceResult): string {
  switch (l.kind ?? 'service') {
    case 'id-only':
      return 'Flat rate, any volume';
    case 'assay':
      return 'Per specimen';
    default:
      return `${price.tierRange} tier`;
  }
}

/** The service-line `<li>`s, priced for one audience. Extra markers are a
 * per-unit surcharge inside the line, so they show as a sub-line. */
export function renderLineItems(quote: Quote, audience: Audience): string {
  return quote.lines
    .map((l) => {
      const price = l[audience];
      const markers =
        l.markers > 1
          ? `\n      <div class="bk-line-sub">${l.markers} markers, first included</div>`
          : '';
      return `<li class="bk-line">
      <div class="bk-line-head"><span class="bk-line-title">${esc(l.serviceTitle)}</span><span class="bk-line-price">${usd(price.total)}</span></div>
      <div class="bk-line-meta">${esc(plural(l.count, l.unitLabel))} × ${rate(price.effectiveRate)} · ${esc(tierText(l, price))}</div>${markers}
    </li>`;
    })
    .join('\n    ');
}

function tbcItems(order: Order): string {
  return order.tbc
    .map(
      (t) => `<li class="bk-line" data-tbc>
      <div class="bk-line-head"><span class="bk-line-title">${esc(t.title)}</span><span class="bk-line-price bk-line-price--tbc">To be confirmed</span></div>
      <div class="bk-line-meta">${esc(t.desc)}</div>
    </li>`,
    )
    .join('\n    ');
}

function triggerList(order: Order): string {
  const items = order.triggers
    .map((t) => `<li><strong>${esc(t.label)}</strong>${t.detail ? ` — ${esc(t.detail)}` : ''}</li>`)
    .join('');
  return `<p class="bk-muted">A few of your choices need a quick conversation before we can take payment:</p>
  <ul data-trigger-list class="bk-triggers">${items}</ul>`;
}

function totalBlock(order: Order, audience: Audience): string {
  const alt: Audience = audience === 'academic' ? 'commercial' : 'academic';
  const priced = order.quote.lines.length > 0;
  const note =
    priced && order.tbc.length
      ? '<span class="bk-total-note">Plus items to be confirmed</span>'
      : '';
  const altText = priced
    ? `${alt === 'academic' ? 'Academic/nonprofit' : 'Commercial'} rate: ${usd(order.quote.total[alt])}`
    : '';
  return `<div class="bk-totals" role="status" aria-live="polite" aria-atomic="true">
    <div class="bk-total-row">
      <span class="bk-total-label">Estimated total${note}</span>
      <span data-total class="bk-total">${priced ? usd(order.quote.total[audience]) : 'To be confirmed'}</span>
    </div>
    <div data-total-alt class="bk-total-alt">${altText}</div>
  </div>`;
}

function callouts(quote: Quote, audience: Audience): string {
  const deadzone = renderDeadzone(quote, audience);
  const upsell = renderUpsell(quote, audience);
  return `<div data-deadzone-callout class="bk-callout bk-callout--ochre"${deadzone ? '' : ' hidden'}>${deadzone ?? ''}</div>
  <div data-upsell-callout class="bk-callout"${upsell ? '' : ' hidden'}>${upsell ?? ''}</div>`;
}

function payCtas(total: number): string {
  return `<p class="bk-fine">
    Turnaround is typically 4–8 weeks from sample receipt. Final pricing is confirmed on the
    count we actually receive.
  </p>
  <button type="button" data-cta-pay class="bk-btn bk-btn--primary bk-btn--block">
    Pay <span data-cta-amount>${usd(total)}</span> and start →
  </button>
  <p data-pay-disclosure class="bk-fine">
    Pay in full to lock your rate and reserve lab capacity. Your quoted per-sample rate is
    held for this project. Send fewer samples than quoted and the unused amount stays as
    credit toward another project for 12 months; send more and we invoice the difference at
    the same rate.
    <a class="bk-link" href="https://biokea.ai/terms">Full terms</a>.
  </p>
  <p class="bk-alt-ctas">
    <button type="button" data-cta-invoice class="bk-linkbtn">
      Paying by purchase order? Get a Net-30 invoice →
    </button>
    <button type="button" data-cta-email class="bk-linkbtn">
      Just want the numbers? Email me this quote →
    </button>
  </p>`;
}

const CONSULT_CTA = `<button type="button" data-cta-consult class="bk-btn bk-btn--primary bk-btn--block">
    Request consultation →
  </button>
  <p class="bk-fine">
    Payment opens once we’ve confirmed the details with you. We’ll send a final quote with a
    payment link.
  </p>`;

/**
 * The inner HTML of `[data-quote-panel]`. Three states: payable ("Ready for
 * checkout", pay/invoice/email CTAs), consult (triggers, to-be-confirmed
 * rows, the consult CTA only), and custom (qPCR: no total at all).
 */
export function renderQuotePanel(order: Order | null, audience: Audience): string {
  if (!order) return '';
  const custom = order.triggers.some((t) => t.key === 'qpcr');
  const state = custom ? 'custom' : order.consult ? 'consult' : 'ready';
  const pillClass = state === 'ready' ? 'bk-pill--ok' : 'bk-pill--consult';
  const rows = [renderLineItems(order.quote, audience), tbcItems(order)].filter(Boolean);

  const parts = [
    `<div class="bk-panel-head">
    <div class="bk-eyebrow">Your draft quote</div>
    <span data-status-pill class="bk-pill ${pillClass}">${STATUS_PILLS[state]}</span>
  </div>`,
  ];
  if (custom) {
    parts.push(
      '<p class="bk-muted">Targeted eDNA projects are quoted individually. Send us a few contact details and we’ll follow up with a custom quote.</p>',
    );
  } else {
    if (order.consult) parts.push(triggerList(order));
    parts.push(`<ul data-line-list class="bk-lines">
    ${rows.join('\n    ')}
  </ul>`);
    parts.push(totalBlock(order, audience));
    parts.push(callouts(order.quote, audience));
  }
  parts.push(order.consult ? CONSULT_CTA : payCtas(order.quote.total[audience]));
  return parts.join('\n  ');
}

/**
 * Dead zone: buying up to a tier floor genuinely costs LESS. Only here is
 * the word "save" truthful.
 *
 * A dead zone can apply to one audience and not the other, because the
 * engine picks the cheapest tier per audience and the academic/commercial
 * rate ratios differ across tiers. Report only for `audience`, and only
 * when it benefits — claiming a saving for a rate that doesn't get one is
 * exactly the dishonesty the isBetterThanLiteral gate exists to prevent.
 */
export function renderDeadzone(quote: Quote, audience: Audience): string | null {
  const saver = quote.lines.find((l) => l[audience].isBetterThanLiteral);
  if (!saver) return null;
  const price = saver[audience];
  return (
    `Priced at our ${esc(price.tierRange)} rate — ` +
    `${usd(price.savings)} less than ${saver.count.toLocaleString()} ${esc(saver.unitLabel)}s ` +
    `would cost, and you can send ${price.freeHeadroom.toLocaleString()} more at no extra cost.`
  );
}

/**
 * Upsell: reaching the next tier costs MORE but lowers the unit rate.
 * Never described as a saving, and never shown when a dead zone applies.
 */
export function renderUpsell(quote: Quote, audience: Audience): string | null {
  const saver = quote.lines.some((l) => l[audience].isBetterThanLiteral);
  if (saver || quote.lines.length !== 1 || quote.needsConversation) return null;
  const l = quote.lines[0];
  const next = nextTierUpsell(l.serviceSlug, l.count, l.markers, audience, l.kind ?? 'service');
  if (!next || next.additionalCost <= 0) return null;
  return (
    `${next.additionalUnits.toLocaleString()} more ${esc(l.unitLabel)}s costs ` +
    `${usd(next.additionalCost)} more at the ${audience === 'academic' ? 'academic' : 'commercial'} rate — ` +
    `and drops it to $${next.newRate}/${esc(l.unitLabel)}.`
  );
}
