import { describe, it, expect } from 'vitest';
import { pricedServices } from '@/data/pricing';
import { buildQuote } from '@/lib/pricing/quote';
import { renderWidgetHtml, renderLineItems, renderDeadzone, renderUpsell } from '@/widget/template';

describe('renderWidgetHtml', () => {
  const html = renderWidgetHtml(pricedServices, { turnstileSiteKey: '1x000' });

  it('renders one card per priced service with the data hooks the page script and e2e rely on', () => {
    for (const s of pricedServices) {
      expect(html).toContain(`data-service-toggle="${s.slug}"`);
      expect(html).toContain(`data-count-input="${s.slug}"`);
      expect(html).toContain(`data-count-slider="${s.slug}"`);
    }
    expect(html).toContain('data-markers-input="metabarcoding"');
    expect(html).not.toContain('data-markers-input="barcoding"');
    for (const hook of [
      'data-total-academic',
      'data-total-commercial',
      'data-line-list',
      'data-deadzone-callout',
      'data-upsell-callout',
      'data-conversation-notice',
      'data-open-form',
      'data-quote-form',
      'data-quote-status',
      'data-deposit-panel',
    ])
      expect(html).toContain(hook);
    expect(html).toContain('class="cf-turnstile"');
    expect(html).toContain('data-sitekey="1x000"');
    expect(renderWidgetHtml(pricedServices, {})).not.toContain('cf-turnstile');
  });

  it('escapes service copy', () => {
    const svc = { ...pricedServices[0], title: 'X <b>bold</b>' };
    expect(renderWidgetHtml([svc], {})).toContain('X &lt;b&gt;bold&lt;/b&gt;');
  });
});

describe('render helpers', () => {
  it('line items list each service with both totals', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
    const li = renderLineItems(q);
    expect(li).toContain('Voucher-Linked Specimen Barcoding');
    expect(li).toContain('800 specimens');
    expect(li).toContain('$9,600');
    // The brief's draft said $12,800; the rate card prices 800 specimens in
    // the 300–999 tier at $15 commercial, so the engine's number is $12,000.
    expect(li).toContain('$12,000');
  });

  it('deadzone copy appears only when a line is better than literal, upsell only otherwise', () => {
    expect(renderDeadzone(buildQuote([{ serviceSlug: 'barcoding', count: 290 }]))).toMatch(
      /less than 290 specimens/,
    );
    expect(renderDeadzone(buildQuote([{ serviceSlug: 'barcoding', count: 100 }]))).toBeNull();
    expect(renderUpsell(buildQuote([{ serviceSlug: 'barcoding', count: 100 }]))).toMatch(
      /more specimens costs/,
    );
    expect(renderUpsell(buildQuote([{ serviceSlug: 'barcoding', count: 290 }]))).toBeNull();
  });
});
