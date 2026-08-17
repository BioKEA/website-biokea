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
import { nextTierUpsell, type Quote } from '@/lib/pricing/quote';

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
 * the right, the capture form and the (hidden) deposit panel inside it. */
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
        <div class="bk-totals" role="status" aria-live="polite" aria-atomic="true">
          <div>
            <div data-total-academic class="bk-total">$0</div>
            <div class="bk-total-label">academic/nonprofit</div>
          </div>
          <div>
            <div data-total-commercial class="bk-total">$0</div>
            <div class="bk-total-label">commercial</div>
          </div>
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

        <button type="button" data-open-form class="bk-btn bk-btn--primary bk-btn--block">
          Email me this quote
        </button>

        <form data-quote-form hidden class="bk-form" novalidate>
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
          <label class="bk-field-label">
            <span class="bk-legend">Anything we should know? (optional)</span>
            <textarea id="quote-note" name="note" rows="3" class="bk-input bk-input--block"></textarea>
          </label>
          <input type="text" name="website" tabindex="-1" autocomplete="off" class="bk-hp" aria-hidden="true" />${turnstile}
          <button type="submit" class="bk-btn bk-btn--teal bk-btn--block">Send my quote →</button>
          <p data-quote-status role="status" aria-live="polite" class="bk-status"></p>
        </form>

        <p data-deposit-note hidden role="status" aria-live="polite" class="bk-status">
          Configuration changed — email a new quote to pay a deposit on it.
        </p>

        <section data-deposit-panel hidden class="bk-deposit">
          <p class="bk-eyebrow bk-eyebrow--ink">Start this project</p>
          <h3 class="bk-deposit-title">Pay a 50% deposit</h3>
          <p class="bk-muted">
            You'll get a Shopify invoice you can pay by card, Shop Pay, or PayPal — or forward to
            accounts payable. The balance is invoiced on actual counts when results are delivered.
          </p>
          <form method="post" data-deposit-form class="bk-deposit-form">
            <label class="bk-choice">
              <input type="radio" name="audience" value="commercial" required />
              <span>Commercial rate — deposit <span data-deposit-commercial></span></span>
            </label>
            <label class="bk-choice">
              <input type="radio" name="audience" value="academic" required />
              <span>Academic / nonprofit rate — deposit <span data-deposit-academic></span></span>
            </label>
            <label class="bk-choice bk-attest">
              <input type="checkbox" name="attest" value="true" />
              <span>
                Required for the academic rate: this work is for a degree-granting institution,
                government agency, or non-profit research organization.
              </span>
            </label>
            <label class="bk-field-label">
              <span class="bk-legend">PO number (optional)</span>
              <input name="po_number" maxlength="64" class="bk-input bk-input--block" />
            </label>
            <button type="submit" class="bk-btn bk-btn--primary bk-btn--block">
              Continue to invoice →
            </button>
          </form>
        </section>
      </div>
    </aside>
  </div>
</div>`;
}

/** The `<li>` list inside `[data-line-list]`. */
export function renderLineItems(quote: Quote): string {
  return quote.lines
    .map((l) => {
      const markerNote = l.markers > 1 ? ` · ${l.markers} markers` : '';
      return `<li class="bk-line">
            <div class="bk-line-title">${esc(l.serviceTitle)}</div>
            <div class="bk-line-meta">${esc(l.count.toLocaleString())} ${esc(l.unitLabel)}s${esc(markerNote)}</div>
            <div class="bk-line-prices">
              <div>
                <div class="bk-line-price">${usd(l.academic.total)}</div>
                <div class="bk-line-tier">academic · ${esc(l.academic.tierRange)}</div>
              </div>
              <div class="bk-line-right">
                <div class="bk-line-price">${usd(l.commercial.total)}</div>
                <div class="bk-line-tier">commercial · ${esc(l.commercial.tierRange)}</div>
              </div>
            </div>
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
 * rate ratios differ across tiers. Report only the audiences that really
 * benefit — claiming a saving for a rate that doesn't get one is exactly
 * the dishonesty the isBetterThanLiteral gate exists to prevent.
 */
export function renderDeadzone(quote: Quote): string | null {
  const saver = quote.lines.find(
    (l) => l.academic.isBetterThanLiteral || l.commercial.isBetterThanLiteral,
  );
  if (!saver) return null;
  const parts: string[] = [];
  if (saver.academic.isBetterThanLiteral) {
    parts.push(
      `<strong>Academic/nonprofit:</strong> priced at our ${esc(saver.academic.tierRange)} rate — ` +
        `${usd(saver.academic.savings)} less than ${saver.count.toLocaleString()} ${esc(saver.unitLabel)}s ` +
        `would cost, and you can send ${saver.academic.freeHeadroom.toLocaleString()} more at no extra cost.`,
    );
  }
  if (saver.commercial.isBetterThanLiteral) {
    parts.push(
      `<strong>Commercial:</strong> priced at our ${esc(saver.commercial.tierRange)} rate — ` +
        `${usd(saver.commercial.savings)} less than ${saver.count.toLocaleString()} ${esc(saver.unitLabel)}s ` +
        `would cost, and you can send ${saver.commercial.freeHeadroom.toLocaleString()} more at no extra cost.`,
    );
  }
  return parts.join('<br><br>');
}

/**
 * Upsell: reaching the next tier costs MORE but lowers the unit rate.
 * Never described as a saving, and never shown when a dead zone applies.
 */
export function renderUpsell(quote: Quote): string | null {
  const saver = quote.lines.some(
    (l) => l.academic.isBetterThanLiteral || l.commercial.isBetterThanLiteral,
  );
  if (saver || quote.lines.length !== 1 || quote.needsConversation) return null;
  const l = quote.lines[0];
  const nextA = nextTierUpsell(l.serviceSlug, l.count, l.markers, 'academic');
  const nextC = nextTierUpsell(l.serviceSlug, l.count, l.markers, 'commercial');
  if (!nextA || nextA.additionalCost <= 0) return null;
  const commercialNote =
    nextC && nextC.additionalCost > 0
      ? ` At the commercial rate that's ${usd(nextC.additionalCost)} more, dropping to $${nextC.newRate}/${esc(l.unitLabel)}.`
      : '';
  return (
    `${nextA.additionalUnits.toLocaleString()} more ${esc(l.unitLabel)}s costs ` +
    `${usd(nextA.additionalCost)} more at the academic rate — and drops it to $${nextA.newRate}/${esc(l.unitLabel)}.` +
    commercialNote
  );
}
