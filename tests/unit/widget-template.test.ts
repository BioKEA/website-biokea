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
      'data-line-list',
      'data-deadzone-callout',
      'data-upsell-callout',
      'data-conversation-notice',
      'data-open-form',
      'data-quote-form',
      'data-quote-status',
      'data-deposit-note',
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

  it('renders a rate selector defaulting to commercial', () => {
    // Commercial is the default: we never headline a rate the visitor may
    // not be eligible for.
    expect(html).toContain('data-audience-toggle="commercial"');
    expect(html).toContain('data-audience-toggle="academic"');
    expect(html).toMatch(/data-audience-toggle="commercial"[^>]*checked/);
    expect(html).not.toMatch(/data-audience-toggle="academic"[^>]*checked/);
  });

  it('renders one headline total and one alternate, and no per-audience hooks', () => {
    // `data-total` is a bare boolean attribute (`data-total class="..."`), so
    // match it specifically rather than with a substring check that a
    // `data-total-alt` (or, before Task 6, nothing else) would also satisfy.
    expect(html).toMatch(/data-total(?!-)/);
    expect(html).toMatch(/data-total-alt/);
    expect(html).not.toContain('data-total-academic');
    expect(html).not.toContain('data-total-commercial');
  });
});

describe('render helpers', () => {
  it('line items list each service with the selected audience total only', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
    const li = renderLineItems(q, 'commercial');
    expect(li).toContain('Voucher-Linked Specimen Barcoding');
    expect(li).toContain('800 specimens');
    // The rate card prices 800 specimens in the 300–999 tier at $15
    // commercial, so the engine's number is $12,000.
    expect(li).toContain('$12,000');
    expect(li).not.toContain('$9,600');
  });

  it('line items show only the selected audience', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
    const html = renderLineItems(q, 'academic');
    expect(html).toContain('$9,600');
    expect(html).not.toContain('$12,000'); // the commercial total
  });

  it('deadzone copy appears only when a line is better than literal, upsell only otherwise', () => {
    expect(
      renderDeadzone(buildQuote([{ serviceSlug: 'barcoding', count: 290 }]), 'commercial'),
    ).toMatch(/less than 290 specimens/);
    expect(
      renderDeadzone(buildQuote([{ serviceSlug: 'barcoding', count: 100 }]), 'commercial'),
    ).toBeNull();
    expect(
      renderUpsell(buildQuote([{ serviceSlug: 'barcoding', count: 100 }]), 'academic'),
    ).toMatch(/more specimens costs/);
    expect(
      renderUpsell(buildQuote([{ serviceSlug: 'barcoding', count: 290 }]), 'academic'),
    ).toBeNull();
  });

  it('the dead-zone callout speaks for one audience only', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 250 }]);
    const html = renderDeadzone(q, 'academic');
    expect(html).toContain('300–999');
    expect(html).not.toMatch(/commercial/i);
  });
});
