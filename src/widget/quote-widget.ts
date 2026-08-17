// src/widget/quote-widget.ts
//
// The quote configurator, framework-free and scoped to a mount element so
// the same bundle runs on biokea.ai/quote and on a Shopify product page.
// This is the old inline <script> from src/pages/quote/index.astro, with
// `document.querySelector` swapped for `root.querySelector`, the markup
// moved to template.ts, and a deposit panel added after a quote is created.
import { pricedServices } from '@/data/pricing';
import { buildQuote, type Quote, type QuoteLineInput } from '@/lib/pricing/quote';
import { depositLines, depositTotalCents, usdCents } from '@/lib/payments/terms';
import {
  esc,
  renderDeadzone,
  renderLineItems,
  renderUpsell,
  renderWidgetHtml,
  usd,
} from './template';

export interface WidgetOptions {
  /** Origin the API lives on. Defaults to same-origin on biokea.ai and in
   * local dev, and to https://biokea.ai everywhere else (the store). */
  apiBase?: string;
  turnstileSiteKey?: string;
  /** 'site' | 'store' — recorded with the quote request. */
  source?: string;
}

export interface QuoteWidget {
  destroy(): void;
}

const SITE_ORIGIN = 'https://biokea.ai';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Non-linear slider: 0–100 maps onto 1–6000 with resolution where it
// matters. A linear scale would squash 1–300 into a few pixels.
const sliderToCount = (v: number) => Math.max(1, Math.round(Math.pow(v / 100, 2.2) * 6000));
const countToSlider = (c: number) => Math.round(Math.pow(c / 6000, 1 / 2.2) * 100);

/** Same-origin when we're already on the site (or a dev server); the site
 * origin when the widget is embedded somewhere else, e.g. the store. */
function defaultApiBase(): string {
  if (typeof location === 'undefined') return SITE_ORIGIN;
  const host = location.hostname;
  if (location.origin === SITE_ORIGIN || host === 'localhost' || host === '127.0.0.1') return '';
  return SITE_ORIGIN;
}

function ensureTurnstileScript(siteKey: string): void {
  if (!siteKey) return;
  if ((window as unknown as { turnstile?: unknown }).turnstile) return;
  if (document.querySelector(`script[src^="${TURNSTILE_SRC}"]`)) return;
  const s = document.createElement('script');
  s.src = TURNSTILE_SRC;
  s.async = true;
  s.defer = true;
  document.head.appendChild(s);
}

export function mountQuoteWidget(root: HTMLElement, opts: WidgetOptions = {}): QuoteWidget {
  const apiBase = opts.apiBase ?? defaultApiBase();
  const source = opts.source ?? 'site';

  root.innerHTML = renderWidgetHtml(pricedServices, { turnstileSiteKey: opts.turnstileSiteKey });
  if (opts.turnstileSiteKey) ensureTurnstileScript(opts.turnstileSiteKey);

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel);
  const $$ = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

  const lineList = $<HTMLUListElement>('[data-line-list]')!;
  const deadzone = $<HTMLElement>('[data-deadzone-callout]')!;
  const upsell = $<HTMLElement>('[data-upsell-callout]')!;
  const conversation = $<HTMLElement>('[data-conversation-notice]')!;
  const openFormBtn = $<HTMLButtonElement>('[data-open-form]')!;
  const form = $<HTMLFormElement>('[data-quote-form]')!;
  const status = $<HTMLElement>('[data-quote-status]')!;
  const depositPanel = $<HTMLElement>('[data-deposit-panel]')!;
  const depositForm = $<HTMLFormElement>('[data-deposit-form]')!;

  // Every listener is registered through this so destroy() can undo them all.
  const bound: { target: EventTarget; type: string; fn: EventListener }[] = [];
  const on = (target: EventTarget, type: string, fn: EventListener) => {
    target.addEventListener(type, fn);
    bound.push({ target, type, fn });
  };

  function readConfig(): QuoteLineInput[] {
    const lines: QuoteLineInput[] = [];
    $$<HTMLInputElement>('[data-service-toggle]').forEach((toggle) => {
      const slug = toggle.dataset.serviceToggle!;
      const body = $<HTMLElement>(`[data-service-body="${slug}"]`)!;
      body.style.display = toggle.checked ? '' : 'none';
      if (!toggle.checked) return;
      const countEl = $<HTMLInputElement>(`[data-count-input="${slug}"]`)!;
      const markersEl = $<HTMLInputElement>(`[data-markers-input="${slug}"]`);
      const count = Math.min(1_000_000, Math.max(1, Math.floor(Number(countEl.value) || 1)));
      const markers = markersEl
        ? Math.min(20, Math.max(1, Math.floor(Number(markersEl.value) || 1)))
        : 1;
      lines.push(
        markers > 1 ? { serviceSlug: slug, count, markers } : { serviceSlug: slug, count },
      );
    });
    return lines;
  }

  function render() {
    const lines = readConfig();
    if (lines.length === 0) {
      $('[data-total-academic]')!.textContent = '$0';
      $('[data-total-commercial]')!.textContent = '$0';
      lineList.innerHTML = '<li class="bk-line-empty">Select a service to see pricing.</li>';
      deadzone.hidden = upsell.hidden = conversation.hidden = true;
      return;
    }

    const quote = buildQuote(lines);
    $('[data-total-academic]')!.textContent = usd(quote.total.academic);
    $('[data-total-commercial]')!.textContent = usd(quote.total.commercial);
    lineList.innerHTML = renderLineItems(quote);

    const deadzoneHtml = renderDeadzone(quote);
    deadzone.hidden = deadzoneHtml === null;
    deadzone.innerHTML = deadzoneHtml ?? '';

    const upsellHtml = renderUpsell(quote);
    upsell.hidden = upsellHtml === null;
    upsell.innerHTML = upsellHtml ?? '';

    conversation.hidden = !quote.needsConversation;
    openFormBtn.textContent = quote.needsConversation
      ? 'Request a project quote'
      : 'Email me this quote';
  }

  $$<HTMLInputElement>('[data-count-input]').forEach((el) => {
    const slug = el.dataset.countInput!;
    const slider = $<HTMLInputElement>(`[data-count-slider="${slug}"]`);
    if (slider) slider.value = String(countToSlider(Number(el.value) || 1));
    on(el, 'input', () => {
      if (slider) slider.value = String(countToSlider(Number(el.value) || 1));
      render();
    });
    on(el, 'change', () => {
      // Normalize on commit (blur/Enter) rather than on every keystroke, so
      // typing "1" on the way to "150" isn't fought by the sanitizer.
      const clamped = Math.min(1_000_000, Math.max(1, Math.floor(Number(el.value) || 1)));
      el.value = String(clamped);
      if (slider) slider.value = String(countToSlider(clamped));
      render();
    });
    if (slider) {
      on(slider, 'input', () => {
        el.value = String(sliderToCount(Number(slider.value)));
        render();
      });
    }
  });

  $$<HTMLInputElement>('[data-markers-input], [data-service-toggle]').forEach((el) =>
    on(el, 'input', render),
  );
  $$<HTMLInputElement>('[data-markers-input]').forEach((el) =>
    on(el, 'change', () => {
      el.value = String(Math.min(20, Math.max(1, Math.floor(Number(el.value) || 1))));
      render();
    }),
  );

  on(openFormBtn, 'click', () => {
    form.hidden = false;
    openFormBtn.hidden = true;
    form.querySelector<HTMLInputElement>('#quote-name')?.focus();
  });

  // The deposit endpoint is the authoritative check for the academic
  // attestation; toggling `required` client-side just surfaces it earlier.
  const attest = depositForm.querySelector<HTMLInputElement>('input[name="attest"]');
  depositForm.querySelectorAll<HTMLInputElement>('input[name="audience"]').forEach((radio) => {
    on(radio, 'change', () => {
      if (attest) attest.required = radio.value === 'academic' && radio.checked;
    });
  });

  function revealDeposit(quote: Quote, token: string): void {
    depositForm.action = `${apiBase}/api/quote/${token}/deposit`;
    const academic = $<HTMLElement>('[data-deposit-academic]');
    const commercial = $<HTMLElement>('[data-deposit-commercial]');
    if (academic) {
      academic.textContent = usdCents(depositTotalCents(depositLines(quote.lines, 'academic')));
    }
    if (commercial) {
      commercial.textContent = usdCents(depositTotalCents(depositLines(quote.lines, 'commercial')));
    }
    depositPanel.hidden = false;
  }

  on(form, 'submit', async (ev) => {
    ev.preventDefault();
    status.textContent = 'Sending…';
    status.style.color = '';
    const fd = new FormData(form);
    const lines = readConfig();
    const payload = {
      name: String(fd.get('name') ?? ''),
      email: String(fd.get('email') ?? ''),
      organization: String(fd.get('organization') ?? ''),
      note: String(fd.get('note') ?? ''),
      website: String(fd.get('website') ?? ''),
      'cf-turnstile-response': String(fd.get('cf-turnstile-response') ?? ''),
      source,
      lines,
    };
    try {
      const res = await fetch(`${apiBase}/api/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        status.innerHTML = `Sent — your quote is <strong>${esc(body.quoteNumber)}</strong>. <a class="bk-link" href="${esc(body.url)}">View it</a>.`;
        status.style.color = 'var(--color-teal, #0f766e)';
        form.reset();
        // A quote that needs a capacity conversation has no firm price, so
        // there is nothing honest to take a deposit on.
        const quote = buildQuote(lines);
        if (body.paymentsEnabled && body.token && !quote.needsConversation) {
          revealDeposit(quote, String(body.token));
        }
      } else {
        status.textContent = body.error ?? 'Something went wrong. Email contact@biokea.ai.';
        status.style.color = 'var(--color-pink, #be185d)';
      }
    } catch {
      status.textContent = 'Network error. Please email contact@biokea.ai.';
      status.style.color = 'var(--color-pink, #be185d)';
    }
  });

  render();

  return {
    destroy() {
      for (const { target, type, fn } of bound) target.removeEventListener(type, fn);
      bound.length = 0;
      root.innerHTML = '';
    },
  };
}
