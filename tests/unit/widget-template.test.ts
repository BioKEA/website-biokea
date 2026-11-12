import { describe, it, expect } from 'vitest';
import { vertebrateNotice } from '@/data/configurator';
import { buildOrder } from '@/lib/pricing/order';
import { buildQuote } from '@/lib/pricing/quote';
import {
  renderWidgetHtml,
  renderQuotePanel,
  renderError,
  renderDeadzone,
  renderUpsell,
  esc,
} from '@/widget/template';
import { bc, edna, qpcr } from './fixtures/configs';
import { metabarcodingBranch } from '@/widget/branches';
import { preparedLibraries } from '@/data/pricing';

describe('renderWidgetHtml (configurator)', () => {
  const html = renderWidgetHtml({ turnstileSiteKey: '1x000' });
  it('renders the four service choices with nothing checked', () => {
    for (const s of ['barcoding', 'metabarcoding', 'metagenomics', 'targeted-edna'])
      expect(html).toContain(`data-service-choice="${s}"`);
    expect(html).not.toMatch(/data-service-choice="[a-z-]+"[^>]*checked/);
    expect(html).toContain('$6–$20 per specimen');
  });
  it('locked to one service: no menu, the service checked, and a way back to the menu', () => {
    const one = renderWidgetHtml({ onlyService: 'metagenomics', servicesHref: '/pages/order' });
    expect(one.match(/data-service-choice=/g)).toHaveLength(1);
    expect(one).toMatch(/data-service-choice="metagenomics"[^>]*checked/);
    expect(one).toContain('Metagenome and metatranscriptome sequencing');
    expect(one).toMatch(/<a [^>]*href="\/pages\/order"[^>]*>Choose a different service/);
    // every branch is still rendered; the controller shows the chosen one
    expect(one.match(/data-branch=/g)).toHaveLength(4);
  });
  it('locked without a safe menu link omits the link', () => {
    for (const href of [undefined, '//evil.example', 'javascript:alert(1)', 'https://x.test'])
      expect(renderWidgetHtml({ onlyService: 'barcoding', servicesHref: href })).not.toContain(
        'Choose a different service',
      );
  });
  it('renders one hidden branch per service with the mockup fields', () => {
    for (const s of ['barcoding', 'metabarcoding', 'metagenomics', 'targeted-edna'])
      expect(html).toMatch(new RegExp(`data-branch="${s}"[^>]*hidden`));
    for (const f of [
      'handling',
      'target',
      'markers',
      'sampleType',
      'samples',
      'perSample',
      'uniqueOrganisms',
      'material',
      'preservativeEdna',
      'kits',
      'targets',
      'assays',
      'source',
      'count',
      'species',
      'measure',
      'assayExists',
      'directions',
    ])
      expect(html).toContain(`data-field="${f}"`);
    expect(html).toContain('Swabs (buccal or skin)');
    expect(html).toContain(vertebrateNotice);
  });
  it('keeps the checkout contract hooks and the audience default', () => {
    for (const hook of [
      'data-quote-panel',
      'data-details-form',
      'data-handoff-form',
      'data-attest-field',
      'data-po-field',
      'data-quote-status',
    ])
      expect(html).toContain(hook);
    expect(html).toMatch(/data-audience-toggle="commercial"[^>]*checked/);
    expect(html).toContain('data-sitekey="1x000"');
  });

  it('renders every remaining field and conditional wrapper the controller reads', () => {
    for (const f of [
      'targetOther',
      'markerOther',
      'sampleOther',
      'perSampleOn',
      'uniqueOn',
      'materialNotes',
      'subs',
      'subs-invertebrates',
      'subs-bacteria',
      'envNotes',
      'qSampleType',
      'approxSamples',
    ])
      expect(html).toContain(`data-field="${f}"`);
    for (const when of [
      'target=other',
      'targets=other',
      'markers=other',
      'sampleType=unknown',
      'perSampleOn=on',
      'uniqueOn=on',
      'target=vertebrates',
      'source=environmental',
      'assays=mt',
      'material=other',
    ])
      expect(html).toMatch(new RegExp(`data-show-when="${when}"[^>]*hidden`));
    expect(html).toContain('data-subs-for="invertebrates"');
    expect(html).toContain('data-marker-suggest');
    expect(html).toContain('data-form-status');
    expect(html).toMatch(/data-field="directions"[^>]*maxlength="2000"/);
    expect(html).toContain('Specific directions for the lab (optional)');
    expect(html).toContain('Add sampling kits ($20 each; confirmed with you before payment)');
  });

  it('carries an error slot after each validated field', () => {
    for (const f of [
      'targetOther',
      'markers',
      'markerOther',
      'sampleOther',
      'samples',
      'perSample',
      'uniqueOrganisms',
      'materialNotes',
      'assays',
      'count',
      'envNotes',
      'species',
      'sampleType',
    ])
      expect(html).toMatch(new RegExp(`data-error-for="${f}"[^>]*hidden`));
  });

  it('drops the old free-text note in favour of directions', () => {
    expect(html).not.toContain('name="note"');
  });

  it('renders Turnstile only with a site key, and never advertises a deposit', () => {
    expect(html).toContain('class="cf-turnstile"');
    expect(renderWidgetHtml({})).not.toContain('cf-turnstile');
    expect(html).not.toMatch(/deposit/i);
    expect(html).toContain('degree-granting institution');
  });
});

describe('renderQuotePanel', () => {
  it('payable order: status pill, lines, total, pay CTA with amount, no consult CTA', () => {
    const p = renderQuotePanel(buildOrder(edna()), 'commercial');
    expect(p).toContain('Ready for checkout');
    expect(p).toContain('$10,500');
    expect(p).toContain('data-cta-pay');
    expect(p).not.toContain('data-cta-consult');
  });
  it('consult order: pill, trigger list, tbc rows, consult CTA, no pay/invoice CTAs', () => {
    const p = renderQuotePanel(buildOrder(bc({ perSample: undefined, kits: true })), 'academic');
    expect(p).toContain('Consultation needed before payment');
    expect(p).toContain('data-trigger-list');
    expect(p).toContain('To be confirmed');
    expect(p).toContain('data-cta-consult');
    expect(p).not.toContain('data-cta-pay');
    expect(p).not.toContain('data-cta-invoice');
  });
  it('qPCR order: custom-quote pill and no total line', () => {
    const p = renderQuotePanel(buildOrder(qpcr()), 'commercial');
    expect(p).toContain('Custom quote after consultation');
    expect(p).not.toContain('data-total"');
  });
  it('extra markers: each selected marker is a sub-line with its own cost', () => {
    // fixture: vertebrates, markers 12S + COI, 60 water samples
    const p = renderQuotePanel(buildOrder(edna()), 'commercial');
    expect(p.match(/class="bk-line"/g)).toHaveLength(1);
    expect(p).toContain('60 samples · 49–199 tier');
    const parts = [
      ...p.matchAll(
        /data-marker-charge[^>]*>\s*<span>([^<]*)<\/span>\s*<span[^>]*>([^<]*)<\/span>/g,
      ),
    ].map((m) => [m[1], m[2]]);
    expect(parts).toEqual([
      ['12S — 60 samples × $160 (tier rate)', '$9,600'],
      ['COI — 60 samples × $15 (added marker)', '$900'],
    ]);
    expect(p).toContain('$10,500');
    expect(p).not.toContain('$175');
    const a = renderQuotePanel(buildOrder(edna()), 'academic');
    expect(a).toContain('12S — 60 samples × $130 (tier rate)');
    expect(a).toContain('COI — 60 samples × $12 (added marker)');
  });

  it('three markers: three priced sub-lines that add up to the line', () => {
    const o = buildOrder(edna({ markers: ['12S', 'COI', '18S'], samples: 250 }));
    const p = renderQuotePanel(o, 'commercial');
    expect(p.match(/data-marker-charge/g)).toHaveLength(3);
    expect(p).toContain('18S — 250 samples × $15 (added marker)');
    expect(o.quote.total.commercial).toBe(250 * 145 + 2 * 250 * 15);
  });

  it('upsell names the next tier rate and the marker charge separately', () => {
    const q = buildQuote([{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }]);
    expect(renderUpsell(q, 'commercial')).toContain(
      'drops it to $145/sample, plus $15/sample per added marker.',
    );
  });

  it('is empty with no order', () => {
    expect(renderQuotePanel(null, 'commercial')).toBe('');
  });

  it('payable panel keeps the ranked CTAs, the credit policy and the alternate rate', () => {
    const p = renderQuotePanel(buildOrder(edna()), 'commercial');
    expect(p).toMatch(/data-cta-amount[^>]*>\$10,500</);
    expect(p).toContain('data-pay-disclosure');
    expect(p).toContain('credit toward another project for 12 months');
    expect(p).toContain('Paying by purchase order? Get a Net-30 invoice →');
    expect(p).toContain('Just want the numbers? Email me this quote →');
    expect(p).toMatch(/data-total-alt[^>]*>Academic\/nonprofit rate: \$8,520</);
  });

  it('shows the selected audience only', () => {
    const p = renderQuotePanel(buildOrder(bc({ markers: ['COI', '12S'] })), 'academic');
    expect(p).toMatch(/data-total[^-][^>]*>\$4,200</);
  });

  it('consult panel lists each trigger and keeps priced lines next to tbc rows', () => {
    const p = renderQuotePanel(buildOrder(edna({ kits: true })), 'commercial');
    expect(p).toContain('<strong>Sampling kits (60)</strong>');
    expect(p).toMatch(/class="bk-line" data-tbc/);
    expect(p).toContain('Estimated total');
    expect(p).toContain('Plus items to be confirmed');
    expect(p).toContain('Request consultation →');
    expect(p).toContain('Payment opens once we’ve confirmed the details with you.');
  });

  it('escapes customer text in triggers', () => {
    const p = renderQuotePanel(
      buildOrder(bc({ markers: ['other'], markerOther: '<b>rbcL</b>' })),
      'commercial',
    );
    expect(p).toContain('&lt;b&gt;rbcL&lt;/b&gt;');
    expect(p).not.toContain('<b>rbcL</b>');
  });
});

describe('render helpers', () => {
  const barcode = (n: number) => buildOrder(bc({ samples: n, perSample: 1 })).quote;

  it('renderError writes an escaped message', () => {
    expect(renderError('samples', 'Enter <n>.')).toBe('Enter &lt;n&gt;.');
    expect(esc('"x"')).toBe('&quot;x&quot;');
  });

  it('deadzone copy appears only when a line is better than literal, upsell only otherwise', () => {
    expect(renderDeadzone(barcode(290), 'commercial')).toMatch(/less than 290 specimens/);
    expect(renderDeadzone(barcode(100), 'commercial')).toBeNull();
    expect(renderUpsell(barcode(100), 'academic')).toMatch(/more specimens costs/);
    expect(renderUpsell(barcode(290), 'academic')).toBeNull();
  });

  it('the dead-zone callout speaks for one audience only', () => {
    const html = renderDeadzone(barcode(250), 'academic');
    expect(html).toContain('300–999');
    expect(html).not.toMatch(/commercial/i);
  });

  it('flat-rate lines never get an upsell', () => {
    const q = buildOrder(bc({ handling: 'idOnly', samples: 2 })).quote;
    expect(renderUpsell(q, 'commercial')).toBeNull();
  });
});

describe('eDNA branch: prepared libraries', () => {
  const html = metabarcodingBranch();
  it('offers samples or prepared libraries, and a platform', () => {
    expect(html).toContain('What will you send us?');
    expect(html).toMatch(/value="samples" data-field="starting" checked/);
    expect(html).toMatch(/value="libraries" data-field="starting"/);
    expect(html).toContain('Indexed libraries, ready to sequence');
    expect(html).toContain('Sequencing platform');
    expect(html).toContain('Illumina (MiSeq i100)');
    expect(html).toContain('Oxford Nanopore');
    expect(html).toMatch(/value="none" data-field="platform" checked/);
    expect(html).toContain('data-small-batch-hint');
    expect(html).toMatch(/data-error-for="platform"[^>]*hidden/);
  });
  it('shows the requirements note for libraries only', () => {
    expect(html).toMatch(/data-show-when="starting=libraries"[^>]*hidden/);
    expect(html).toContain(esc(preparedLibraries.requirementsNote));
  });
  it('hides sample type, kits and the no-preference platform unless sending samples', () => {
    const parts = html.split('data-show-when="starting=samples"');
    expect(parts).toHaveLength(4); // sample type, no preference, kits
    expect(parts[1]).toContain('Sample type');
    expect(parts[2]).toContain('No preference');
    expect(parts[3]).toContain('Sampling kits');
  });
});
