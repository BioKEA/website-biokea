// src/widget/template.ts
//
// Pure markup for the quote configurator. Every function here returns a
// string and touches no DOM, so the whole surface is unit-testable and the
// same strings can be rendered on the site, on the Shopify store, or in a
// test. The `data-*` hooks are contractual — tests/e2e/quote.spec.ts and
// quote-widget.ts both address the widget through them, so they must not
// drift. Styling is the `.bk-*` class set in quote.css (no Tailwind: the
// bundle has to look right on a Shopify theme too).
import type { PricedService } from '@/data/pricing';
import { nextTierUpsell, type Audience, type Quote } from '@/lib/pricing/quote';

export interface WidgetTemplateOptions {
  turnstileSiteKey?: string;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML-escape any interpolated copy. Service data is ours, but it is still
 * content, and the same helper guards the API's echo of a quote number. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export const usd = (n: number): string => '$' + n.toLocaleString('en-US');

function serviceCard(svc: PricedService, index: number): string {
  const checked = index === 0 ? ' checked' : '';
  const markers = svc.additionalMarkerPrice
    ? `
        <div class="bk-field">
          <label class="bk-label" for="markers-${esc(svc.slug)}">Number of markers</label>
          <input
            id="markers-${esc(svc.slug)}"
            type="number"
            min="1"
            max="20"
            step="1"
            value="1"
            data-markers-input="${esc(svc.slug)}"
            class="bk-input bk-input--sm"
          />
          <p class="bk-fine">
            First marker included. Each additional adds $${esc(svc.additionalMarkerPrice.academic)}/${esc(svc.unitLabel)}
            (academic) or $${esc(svc.additionalMarkerPrice.commercial)}/${esc(svc.unitLabel)} (commercial).
          </p>
        </div>`
    : '';

  return `
    <div class="bk-card">
      <label class="bk-toggle">
        <input type="checkbox" data-service-toggle="${esc(svc.slug)}"${checked} />
        <span class="bk-toggle-title">${esc(svc.title)}</span>
      </label>
      <p class="bk-tagline">${esc(svc.tagline)}</p>

      <div class="bk-body" data-service-body="${esc(svc.slug)}">
        <div class="bk-field">
          <label class="bk-label" for="count-${esc(svc.slug)}">Number of ${esc(svc.unitLabel)}s</label>
          <div class="bk-row">
            <input
              id="count-${esc(svc.slug)}"
              type="number"
              min="1"
              step="1"
              value="100"
              data-count-input="${esc(svc.slug)}"
              class="bk-input"
            />
            <input
              type="range"
              min="0"
              max="100"
              value="0"
              data-count-slider="${esc(svc.slug)}"
              aria-label="${esc(svc.title)} volume slider"
              class="bk-range"
            />
          </div>
        </div>${markers}

        <ul class="bk-included">
          ${svc.included.map((item) => `<li><span class="bk-tick">✓</span><span>${esc(item)}</span></li>`).join('\n          ')}
        </ul>
      </div>
    </div>`;
}

/** The whole widget: service cards on the left, the live summary aside on
 * the right, with the three ranked CTAs, the details capture form, and the
 * hidden hand-off form that carries the browser to Shopify checkout. */
export function renderWidgetHtml(
  services: PricedService[],
  opts: WidgetTemplateOptions = {},
): string {
  const turnstile = opts.turnstileSiteKey
    ? `\n          <div class="cf-turnstile" data-sitekey="${esc(opts.turnstileSiteKey)}" data-size="flexible"></div>`
    : '';

  return `
<div class="bk-quote">
  <div class="bk-grid">
    <div class="bk-services">${services.map((svc, i) => serviceCard(svc, i)).join('\n')}
    </div>

    <aside data-summary-panel class="bk-summary">
      <div class="bk-summary-head">
        <div class="bk-eyebrow">Your quote</div>
        <fieldset class="bk-rates">
          <legend class="bk-legend">Rates for</legend>
          <label class="bk-rate">
            <input
              type="radio"
              name="bk-audience"
              value="commercial"
              data-audience-toggle="commercial"
              checked
            />
            <span>Commercial</span>
          </label>
          <label class="bk-rate">
            <input type="radio" name="bk-audience" value="academic" data-audience-toggle="academic" />
            <span>Academic / nonprofit</span>
          </label>
        </fieldset>
        <div class="bk-totals" role="status" aria-live="polite" aria-atomic="true">
          <div data-total class="bk-total">$0</div>
          <div data-total-alt class="bk-total-alt"></div>
        </div>
      </div>

      <div class="bk-summary-body">
        <ul data-line-list class="bk-lines"></ul>

        <div
          data-deadzone-callout
          hidden
          role="status"
          aria-live="polite"
          class="bk-callout bk-callout--ochre"
        ></div>

        <div data-upsell-callout hidden role="status" aria-live="polite" class="bk-callout"></div>

        <div data-conversation-notice hidden class="bk-notice">
          At this volume we quote per project — sequencing capacity and timeline need confirming
          before we commit to a price. The figures above are indicative.
        </div>

        <p class="bk-fine bk-fine--spaced">
          Turnaround is typically 4–8 weeks from sample receipt. Final pricing is confirmed on the
          count we actually receive.
        </p>

        <button type="button" data-cta-pay class="bk-btn bk-btn--primary bk-btn--block">
          Pay <span data-cta-amount>$0</span> and start →
        </button>
        <p class="bk-fine bk-fine--spaced">
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
        </p>

        <form data-details-form hidden class="bk-form" novalidate>
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
          <label class="bk-field-label">
            <span class="bk-legend">Anything we should know? (optional)</span>
            <textarea id="quote-note" name="note" rows="3" class="bk-input bk-input--block"></textarea>
          </label>
          <input type="text" name="website" tabindex="-1" autocomplete="off" class="bk-hp" aria-hidden="true" />${turnstile}
          <button type="submit" class="bk-btn bk-btn--teal bk-btn--block">Send my quote →</button>
          <p data-quote-status role="status" aria-live="polite" class="bk-status"></p>
        </form>

        <form method="post" data-handoff-form hidden aria-hidden="true">
          <input type="hidden" name="audience" />
          <input type="hidden" name="attest" />
          <input type="hidden" name="intent" />
          <input type="hidden" name="po_number" />
        </form>
      </div>
    </aside>
  </div>
</div>`;
}

/** The `<li>` list inside `[data-line-list]`, priced for one audience. */
export function renderLineItems(quote: Quote, audience: Audience): string {
  return quote.lines
    .map((l) => {
      const markerNote = l.markers > 1 ? ` · ${l.markers} markers` : '';
      const price = l[audience];
      return `<li class="bk-line">
            <div class="bk-line-title">${esc(l.serviceTitle)}</div>
            <div class="bk-line-meta">${esc(l.count.toLocaleString())} ${esc(l.unitLabel)}s${esc(markerNote)}</div>
            <div class="bk-line-price">${usd(price.total)}</div>
            <div class="bk-line-tier">${esc(price.tierRange)}</div>
          </li>`;
    })
    .join('');
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
  const next = nextTierUpsell(l.serviceSlug, l.count, l.markers, audience);
  if (!next || next.additionalCost <= 0) return null;
  return (
    `${next.additionalUnits.toLocaleString()} more ${esc(l.unitLabel)}s costs ` +
    `${usd(next.additionalCost)} more at the ${audience === 'academic' ? 'academic' : 'commercial'} rate — ` +
    `and drops it to $${next.newRate}/${esc(l.unitLabel)}.`
  );
}
