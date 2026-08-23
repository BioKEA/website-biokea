// src/widget/quote-widget.ts
//
// The quote configurator, framework-free and scoped to a mount element so
// the same bundle runs on biokea.ai/quote and on a Shopify product page.
// This is the old inline <script> from src/pages/quote/index.astro, with
// `document.querySelector` swapped for `root.querySelector`, the markup
// moved to template.ts, and three ranked CTAs (pay, invoice, email) that
// chain a details-form submission straight into Shopify checkout.
import { pricedServices } from '@/data/pricing';
import { buildQuote, type Audience, type QuoteLineInput } from '@/lib/pricing/quote';
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
 * in the status line or a junk token in the hand-off form's action.
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
  const ctaPay = $<HTMLButtonElement>('[data-cta-pay]')!;
  const ctaAmount = $<HTMLElement>('[data-cta-amount]')!;
  // The disclosure paragraph immediately follows the pay button in the
  // template and only makes sense alongside it — no hook of its own, since
  // it isn't one Task 10's e2e suite addresses.
  const payDisclosure = ctaPay.nextElementSibling as HTMLElement | null;
  const ctaInvoice = $<HTMLButtonElement>('[data-cta-invoice]')!;
  const ctaEmail = $<HTMLButtonElement>('[data-cta-email]')!;
  const detailsForm = $<HTMLFormElement>('[data-details-form]')!;
  const status = $<HTMLElement>('[data-quote-status]')!;
  const attestField = $<HTMLElement>('[data-attest-field]')!;
  const poField = $<HTMLElement>('[data-po-field]')!;
  const handoff = $<HTMLFormElement>('[data-handoff-form]')!;

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

  // Commercial is the default: we never headline a rate the visitor may not
  // be eligible for.
  let audience: Audience = 'commercial';

  // Which CTA opened the details form — decides what the details form's
  // submit chains into (or doesn't) and which of the academic/PO fields
  // show. Defaults to 'pay' so a first render's openDetails('pay') call (if
  // it ever fires before a click) behaves sanely.
  type Intent = 'pay' | 'invoice' | 'email';
  let intent: Intent = 'pay';

  // The configuration the current quote/hand-off was created for; null
  // once it's gone stale. See invalidateHandoff().
  let handoffSignature: string | null = null;

  function invalidateHandoff(): void {
    handoffSignature = null;
    handoff.removeAttribute('action');
  }

  function openDetails(next: Intent): void {
    intent = next;
    detailsForm.hidden = false;
    // Attestation is only needed where money moves; the email-me path never
    // reaches the pay endpoint, which is the authority for it anyway.
    attestField.hidden = !(audience === 'academic' && next !== 'email');
    attestField.querySelector<HTMLInputElement>('input')!.required = !attestField.hidden;
    poField.hidden = next !== 'invoice';
    detailsForm.querySelector<HTMLInputElement>('#quote-name')?.focus();
  }

  function render() {
    const lines = readConfig();
    // A hand-off is a hand-off for one specific quote. The moment the
    // config stops matching it, the hidden form would be posting the old
    // token at the old amount, so it goes away — the retry path is
    // /quote/<token>, unchanged.
    if (handoffSignature !== null && configSignature(lines) !== handoffSignature) {
      invalidateHandoff();
    }
    if (lines.length === 0) {
      $('[data-total]')!.textContent = '$0';
      $('[data-total-alt]')!.textContent = '';
      lineList.innerHTML = '<li class="bk-line-empty">Select a service to see pricing.</li>';
      deadzone.hidden = upsell.hidden = conversation.hidden = true;
      return;
    }

    const quote = buildQuote(lines);
    const alt: Audience = audience === 'academic' ? 'commercial' : 'academic';
    $('[data-total]')!.textContent = usd(quote.total[audience]);
    $('[data-total-alt]')!.textContent =
      `${alt === 'academic' ? 'Academic/nonprofit' : 'Commercial'} rate: ${usd(quote.total[alt])}`;
    lineList.innerHTML = renderLineItems(quote, audience);
    ctaAmount.textContent = usd(quote.total[audience]);

    const deadzoneHtml = renderDeadzone(quote, audience);
    deadzone.hidden = deadzoneHtml === null;
    deadzone.innerHTML = deadzoneHtml ?? '';

    const upsellHtml = renderUpsell(quote, audience);
    upsell.hidden = upsellHtml === null;
    upsell.innerHTML = upsellHtml ?? '';

    conversation.hidden = !quote.needsConversation;
    // needsConversation means there's no firm price to pay against, so the
    // three ranked CTAs collapse to the one that still makes sense.
    ctaPay.hidden = quote.needsConversation;
    if (payDisclosure) payDisclosure.hidden = quote.needsConversation;
    ctaInvoice.hidden = quote.needsConversation;
    ctaEmail.textContent = quote.needsConversation
      ? 'Request a project quote →'
      : 'Just want the numbers? Email me this quote →';
    // The attestation/PO rows depend on the rate too, so re-evaluate them
    // whenever the form is already open and something changed under it.
    if (!detailsForm.hidden) openDetails(intent);
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

  $$<HTMLInputElement>('[data-audience-toggle]').forEach((el) =>
    on(el, 'change', () => {
      if (!el.checked) return;
      audience = el.dataset.audienceToggle as Audience;
      render();
    }),
  );

  $$<HTMLInputElement>('[data-markers-input], [data-service-toggle]').forEach((el) =>
    on(el, 'input', render),
  );
  $$<HTMLInputElement>('[data-markers-input]').forEach((el) =>
    on(el, 'change', () => {
      el.value = String(Math.min(20, Math.max(1, Math.floor(Number(el.value) || 1))));
      render();
    }),
  );

  on(ctaPay, 'click', () => openDetails('pay'));
  on(ctaInvoice, 'click', () => openDetails('invoice'));
  on(ctaEmail, 'click', () => openDetails('email'));

  on(detailsForm, 'submit', async (ev) => {
    ev.preventDefault();
    status.textContent = 'Sending…';
    status.style.color = '';
    const fd = new FormData(detailsForm);
    const lines = readConfig();
    // Read before detailsForm.reset() clears the form.
    const attested = fd.get('attest') === 'true';
    const po = String(fd.get('po_number') ?? '');
    const payload = {
      name: String(fd.get('name') ?? ''),
      email: String(fd.get('email') ?? ''),
      organization: String(fd.get('organization') ?? ''),
      note: String(fd.get('note') ?? ''),
      website: String(fd.get('website') ?? ''),
      'cf-turnstile-response': String(fd.get('cf-turnstile-response') ?? ''),
      source,
      lines,
      audience,
      attest: audience === 'academic' && attested,
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
        detailsForm.reset();
        // A quote that needs a capacity conversation has no firm price, so
        // there is nothing honest to pay against. Nor is there anything to
        // pay if the configuration moved on while the request was in
        // flight — the quote that came back is not what's on screen. The
        // "email me this quote" intent never chains into checkout at all.
        const quote = buildQuote(lines);
        const signature = configSignature(lines);
        if (
          intent !== 'email' &&
          body.paymentsEnabled &&
          isQuoteToken(body.token) &&
          !quote.needsConversation &&
          configSignature(readConfig()) === signature
        ) {
          handoffSignature = signature;
          // Native submit, so the endpoint's 303 to Shopify is a top-level
          // navigation — which is what makes this work from the store's
          // origin as well as ours.
          handoff.action = `${apiBase}/api/quote/${body.token}/pay`;
          (handoff.elements.namedItem('audience') as HTMLInputElement).value = audience;
          (handoff.elements.namedItem('attest') as HTMLInputElement).value = attested ? 'true' : '';
          (handoff.elements.namedItem('intent') as HTMLInputElement).value = intent;
          (handoff.elements.namedItem('po_number') as HTMLInputElement).value = po;
          handoff.submit();
        }
        // If the chain didn't fire, the status line above already carries
        // the quote link, and /quote/<token> is the retry path — nothing
        // else about this branch changes.
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
