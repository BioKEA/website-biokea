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
import { configSignature } from './state';
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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Just enough of the Turnstile API to render (and later remove) a widget
// explicitly.
interface TurnstileApi {
  render(el: HTMLElement, opts: { sitekey: string }): unknown;
  remove?(el: HTMLElement): void;
}

/** The API hands back a token and a URL; neither is rendered without a
 * shape check first, so a surprising response can't put a javascript: link
 * in the status line or a junk token in the deposit form's action.
 * Protocol-relative ("//evil.example") is rejected too — it would resolve
 * against whatever origin the widget happens to be embedded on. */
const isQuoteToken = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
const safeUrl = (v: unknown): string | null =>
  typeof v === 'string' && (v.startsWith('https://') || (v.startsWith('/') && !v.startsWith('//')))
    ? v
    : null;

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

/**
 * Turnstile renders `.cf-turnstile` elements implicitly when its script
 * loads — which is no help if we mount after that has already happened
 * (a second widget on the page, or a late/dynamic mount), leaving a dead
 * empty box. So: render explicitly when the API is already there, and fall
 * back to injecting the script and letting implicit rendering do it.
 */
function setupTurnstile(root: HTMLElement, siteKey: string): void {
  if (!siteKey) return;
  const el = root.querySelector<HTMLElement>('.cf-turnstile');
  const api = (window as Window & { turnstile?: TurnstileApi }).turnstile;
  if (api && el) {
    if (el.dataset.bkRendered === '1') return;
    el.dataset.bkRendered = '1';
    try {
      api.render(el, { sitekey: siteKey });
    } catch {
      // A captcha that won't render must not take the configurator with it;
      // the server still rejects a submission with no token.
    }
    return;
  }
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
  if (opts.turnstileSiteKey) setupTurnstile(root, opts.turnstileSiteKey);

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
  const depositNote = $<HTMLElement>('[data-deposit-note]')!;

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

  // The configuration the visible deposit panel was created for; null when
  // no panel is showing. See invalidateDeposit().
  let depositSignature: string | null = null;

  function invalidateDeposit(): void {
    depositSignature = null;
    depositPanel.hidden = true;
    depositForm.removeAttribute('action');
    // The "Sent — quote …" line in `status` stays put; the reason the
    // deposit panel just disappeared goes in its own element instead of
    // overwriting it.
    depositNote.hidden = false;
  }

  function render() {
    const lines = readConfig();
    // A deposit is a deposit on one specific quote. The moment the config
    // stops matching it, the panel would be posting the old token at the old
    // amount, so it goes away.
    if (depositSignature !== null && configSignature(lines) !== depositSignature) {
      invalidateDeposit();
    }
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

  function revealDeposit(quote: Quote, token: string, signature: string): void {
    depositSignature = signature;
    depositNote.hidden = true;
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
        const url = safeUrl(body.url);
        status.innerHTML =
          `Sent — your quote is <strong>${esc(body.quoteNumber)}</strong>.` +
          (url ? ` <a class="bk-link" href="${esc(url)}">View it</a>.` : '');
        status.style.color = 'var(--color-teal, #0f766e)';
        form.reset();
        // A quote that needs a capacity conversation has no firm price, so
        // there is nothing honest to take a deposit on. Nor is there anything
        // to pay if the configuration moved on while the request was in
        // flight — the quote that came back is not what's on screen.
        const quote = buildQuote(lines);
        const signature = configSignature(lines);
        if (
          body.paymentsEnabled &&
          isQuoteToken(body.token) &&
          !quote.needsConversation &&
          configSignature(readConfig()) === signature
        ) {
          revealDeposit(quote, body.token, signature);
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
      const turnstileEl = root.querySelector<HTMLElement>('.cf-turnstile');
      if (turnstileEl?.dataset.bkRendered === '1') {
        try {
          (window as Window & { turnstile?: TurnstileApi }).turnstile?.remove?.(turnstileEl);
        } catch {
          // A widget that won't unmount cleanly must not block destroy().
        }
      }
      for (const { target, type, fn } of bound) target.removeEventListener(type, fn);
      bound.length = 0;
      root.innerHTML = '';
      // entry.ts sets this to keep a double include from mounting twice;
      // after destroy() the element is mountable again.
      delete root.dataset.bkMounted;
    },
  };
}
