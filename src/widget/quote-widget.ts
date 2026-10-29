// src/widget/quote-widget.ts
//
// The order configurator, framework-free and scoped to a mount element so
// the same bundle runs on biokea.ai/quote and on a Shopify product page.
// Markup is template.ts/branches.ts; reading the chosen branch into a
// ProjectConfig is config-reader.ts. This file owns the state (service,
// rate, the CTA that opened the details form, the live hand-off), the
// render loop (validate → price → draft quote panel), and the details-form
// submit that creates the quote and, on the pay/invoice paths, chains a
// native form POST into Shopify checkout.
import type { ServiceSlug } from '@/data/configurator';
import { buildOrder, validateConfig, type Order, type ProjectConfig } from '@/lib/pricing/order';
import type { Audience } from '@/lib/pricing/quote';
import {
  applyMarkers,
  clampCount,
  isServiceSlug,
  markerSuggestion,
  readBranch,
  renderMarkerNote,
  showErrors,
  syncHints,
  syncShowWhen,
} from './config-reader';
import { configSignature } from './state';
import { esc, renderQuotePanel, renderWidgetHtml, STATUS_PILLS } from './template';

export interface WidgetOptions {
  /** Origin the API lives on. Defaults to same-origin on biokea.ai and in
   * local dev, and to https://biokea.ai everywhere else (the store). */
  apiBase?: string;
  turnstileSiteKey?: string;
  /** 'site' | 'store' — recorded with the quote request. */
  source?: string;
  /** Pre-selects a service (store product pages, `?service=` links). */
  service?: ServiceSlug;
}

export interface QuoteWidget {
  destroy(): void;
}

const SITE_ORIGIN = 'https://biokea.ai';
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINISH_FIELDS = 'Finish the highlighted fields to see your quote.';
const PINK = 'var(--color-pink, #be185d)';
const TEAL = 'var(--color-teal, #0f766e)';

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

/** Which CTA opened the details form: decides which of the academic/PO
 * fields show and what the submit chains into (or doesn't). */
type Intent = 'pay' | 'invoice' | 'email' | 'consult';
const CTA_INTENTS: [string, Intent][] = [
  ['[data-cta-pay]', 'pay'],
  ['[data-cta-invoice]', 'invoice'],
  ['[data-cta-email]', 'email'],
  ['[data-cta-consult]', 'consult'],
];
const movesMoney = (i: Intent) => i === 'pay' || i === 'invoice';

export function mountQuoteWidget(root: HTMLElement, opts: WidgetOptions = {}): QuoteWidget {
  const apiBase = opts.apiBase ?? defaultApiBase();
  const source = opts.source ?? 'site';

  // GA4 funnel events. The HOST page owns the tag (biokea.ai loads it via
  // BaseLayout; the store only if GA is added to the theme) — the widget
  // never injects gtag, and an absent gtag is a silent no-op.
  function track(event: string, params: Record<string, unknown>): void {
    try {
      (window as { gtag?: (...a: unknown[]) => void }).gtag?.('event', event, params);
    } catch {
      // analytics must never break the widget
    }
  }
  let engaged = false;
  function markEngaged(): void {
    if (engaged) return;
    engaged = true;
    track('quote_widget_engaged', { source });
  }

  root.innerHTML = renderWidgetHtml({ turnstileSiteKey: opts.turnstileSiteKey });
  if (opts.turnstileSiteKey) setupTurnstile(root, opts.turnstileSiteKey);

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const branches = Array.from(root.querySelectorAll<HTMLElement>('[data-branch]'));
  const directionsStep = $<HTMLElement>('[data-step="directions"]');
  const directionsInput = $<HTMLTextAreaElement>('[data-step="directions"] [data-field]');
  const formStatus = $<HTMLElement>('[data-form-status]');
  const panel = $<HTMLElement>('[data-quote-panel]');
  const detailsForm = $<HTMLFormElement>('[data-details-form]');
  const submitBtn = $<HTMLButtonElement>('[data-details-form] button[type="submit"]');
  const status = $<HTMLElement>('[data-quote-status]');
  const attestField = $<HTMLElement>('[data-attest-field]');
  const attestInput = attestField.querySelector<HTMLInputElement>('input')!;
  const poField = $<HTMLElement>('[data-po-field]');
  const handoff = $<HTMLFormElement>('[data-handoff-form]');

  // Every listener is registered through this so destroy() can undo them all.
  const bound: { target: EventTarget; type: string; fn: EventListener }[] = [];
  const on = (target: EventTarget, type: string, fn: EventListener) => {
    target.addEventListener(type, fn);
    bound.push({ target, type, fn });
  };

  let service: ServiceSlug | null = null;
  // Commercial is the default: we never headline a rate the visitor may not
  // be eligible for.
  let audience: Audience = 'commercial';
  let intent: Intent = 'pay';
  // Suggested markers follow the targets until the customer edits them.
  let markersTouched = false;
  // The order on screen (null while there is no valid configuration).
  let order: Order | null = null;
  // The configuration the current hand-off was created for; null once
  // it's gone stale. See invalidateHandoff().
  let handoffSignature: string | null = null;
  // The configuration a consultation was requested for, so the pill can
  // say so until the configuration changes.
  let requestedSignature: string | null = null;
  // What the panel currently holds, so an unchanged render is a no-op.
  let panelHtml = '';

  const activeBranch = (): HTMLElement | null =>
    service ? (branches.find((b) => b.dataset.branch === service) ?? null) : null;

  function readConfig(): ProjectConfig | null {
    const branch = activeBranch();
    return service && branch ? readBranch(service, branch, directionsInput.value) : null;
  }

  function invalidateHandoff(): void {
    handoffSignature = null;
    handoff.removeAttribute('action');
  }

  /** Attestation is only needed where money moves (pay/invoice); the PO
   * number only on the invoice path. */
  function syncDetailsFields(): void {
    attestField.hidden = !(audience === 'academic' && movesMoney(intent));
    attestInput.required = !attestField.hidden;
    poField.hidden = intent !== 'invoice';
    submitBtn.textContent = intent === 'consult' ? 'Request consultation →' : 'Send my quote →';
  }

  function openDetails(next: Intent): void {
    intent = next;
    detailsForm.hidden = false;
    syncDetailsFields();
    detailsForm.querySelector<HTMLInputElement>('#quote-name')?.focus();
  }

  function applySuggestion(): void {
    const branch = activeBranch();
    if (!service || !branch) return;
    const suggested = markerSuggestion(service, branch);
    if (!markersTouched) applyMarkers(branch, suggested);
    renderMarkerNote(branch, suggested, markersTouched);
  }

  function hidePanel(): void {
    order = null;
    panel.hidden = true;
    panel.innerHTML = panelHtml = '';
    // Its CTAs are gone, so the details form they opened goes too.
    detailsForm.hidden = true;
  }

  function render(): void {
    const config = readConfig();
    const branch = activeBranch();
    for (const b of branches) b.hidden = b !== branch;
    directionsStep.hidden = !config;
    // A hand-off is a hand-off for one specific quote. The moment the
    // config stops matching it, the hidden form would be posting the old
    // token at the old amount, so it goes away — the retry path is
    // /quote/<token>, unchanged.
    if (handoffSignature !== null && configSignature(config) !== handoffSignature) {
      invalidateHandoff();
    }
    if (!config || !branch) {
      formStatus.hidden = true;
      formStatus.textContent = '';
      hidePanel();
      return;
    }
    syncShowWhen(branch);
    syncHints(branch, config);
    const errors = validateConfig(config);
    showErrors(branch, errors);
    if (Object.keys(errors).length > 0) {
      formStatus.textContent = FINISH_FIELDS;
      formStatus.hidden = false;
      hidePanel();
      return;
    }
    formStatus.hidden = true;
    formStatus.textContent = '';
    order = buildOrder(config);
    const requested = order.consult && requestedSignature === configSignature(config);
    const html = renderQuotePanel(order, audience) + (requested ? '<!--requested-->' : '');
    // Only touch the DOM when the panel actually changed: a blur-commit
    // (`change`) on a count fires between mousedown and click on a CTA, and
    // replacing the button under the pointer would swallow that click.
    if (html !== panelHtml) {
      panelHtml = html;
      panel.innerHTML = html;
      if (requested) {
        panel.querySelector('[data-status-pill]')!.textContent = STATUS_PILLS.requested;
      }
    }
    panel.hidden = false;
    if (!detailsForm.hidden) {
      // A form opened from a pay/invoice/email CTA no longer fits a consult
      // quote (or the reverse): close it and let the customer choose again.
      if ((intent === 'consult') !== order.consult) detailsForm.hidden = true;
      else syncDetailsFields();
    }
  }

  function selectService(next: ServiceSlug): void {
    service = next;
    markersTouched = false;
    applySuggestion();
  }

  function onConfigEvent(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    if (!(el instanceof Element) || el.closest('[data-details-form], [data-handoff-form]')) return;
    markEngaged();
    if (el.matches('[data-service-choice]')) {
      if (el.checked && isServiceSlug(el.value) && el.value !== service) selectService(el.value);
    } else if (el.matches('[data-audience-toggle]')) {
      if (el.checked) audience = el.value === 'academic' ? 'academic' : 'commercial';
    } else {
      const field = el.dataset.field;
      if (field === 'markers') markersTouched = true;
      if (ev.type === 'change') clampCount(el);
      // Branch-local so the suggestion follows the visible picker only.
      if (field === 'target' || field === 'targets' || field === 'markers') applySuggestion();
    }
    render();
  }
  on(root, 'input', onConfigEvent);
  on(root, 'change', onConfigEvent);

  // "Use suggested markers" lives in the branch; the CTAs live in the panel,
  // which is re-rendered whole — one delegated listener each, bound once.
  on(root, 'click', (ev) => {
    const target = ev.target as Element;
    if (target.closest?.('[data-use-suggested]')) {
      markersTouched = false;
      applySuggestion();
      render();
    }
  });
  on(panel, 'click', (ev) => {
    const target = ev.target as Element;
    for (const [sel, next] of CTA_INTENTS) {
      if (target.closest?.(sel)) return openDetails(next);
    }
  });

  on(detailsForm, 'submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(detailsForm);
    const config = readConfig();
    // Read before detailsForm.reset() clears the form.
    const attested = fd.get('attest') === 'true';
    const po = String(fd.get('po_number') ?? '');
    const submitIntent = intent;

    if (!config || !order) {
      status.textContent = FINISH_FIELDS;
      status.style.color = PINK;
      return;
    }
    // The form carries `novalidate` (Turnstile isn't a control the browser
    // understands to validate around), so the `required` on the attestation
    // checkbox enforces nothing by itself. A missed attestation on the
    // pay/invoice path would get a quote created and emailed and only
    // surface as pay.ts bouncing the browser to an error page — so it is
    // checked here, before anything is sent.
    if (movesMoney(submitIntent) && audience === 'academic' && !attested) {
      attestInput.reportValidity();
      status.textContent = 'Please confirm the academic-rate eligibility statement above.';
      status.style.color = PINK;
      return;
    }

    const quotedOrder = order;
    const quotedAudience = audience;
    const signature = configSignature(config);
    const attest = quotedAudience === 'academic' && movesMoney(submitIntent) && attested;
    status.textContent = 'Sending…';
    status.style.color = '';
    const payload = {
      name: String(fd.get('name') ?? ''),
      email: String(fd.get('email') ?? ''),
      organization: String(fd.get('organization') ?? ''),
      directions: config.directions ?? '',
      website: String(fd.get('website') ?? ''),
      'cf-turnstile-response': String(fd.get('cf-turnstile-response') ?? ''),
      source,
      config,
      audience: quotedAudience,
      attest,
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
        const link = url ? ` <a class="bk-link" href="${esc(url)}">View it</a>.` : '';
        status.innerHTML =
          submitIntent === 'consult'
            ? `Consultation requested — we'll reply with a firm quote. Your reference is <strong>${esc(body.quoteNumber)}</strong>.${link}`
            : `Sent — your quote is <strong>${esc(body.quoteNumber)}</strong>.${link}`;
        status.style.color = TEAL;
        detailsForm.reset();
        syncDetailsFields();
        const value = quotedOrder.quote.total[quotedAudience];
        track('quote_created', { source, currency: 'USD', value });
        // Nothing to pay against if the quote needs a consultation, nor if
        // the configuration moved on while the request was in flight — the
        // quote that came back is not what's on screen. The email-me and
        // consult paths never chain into checkout at all.
        const current = configSignature(readConfig());
        if (submitIntent === 'consult' && current === signature) {
          requestedSignature = signature;
          render();
        }
        if (
          movesMoney(submitIntent) &&
          body.paymentsEnabled &&
          !body.consult &&
          isQuoteToken(body.token) &&
          current === signature
        ) {
          handoffSignature = signature;
          // Native submit, so the endpoint's 303 to Shopify is a top-level
          // navigation — which is what makes this work from the store's
          // origin as well as ours.
          handoff.action = `${apiBase}/api/quote/${body.token}/pay`;
          (handoff.elements.namedItem('audience') as HTMLInputElement).value = quotedAudience;
          (handoff.elements.namedItem('attest') as HTMLInputElement).value = attest ? 'true' : '';
          (handoff.elements.namedItem('intent') as HTMLInputElement).value = submitIntent;
          (handoff.elements.namedItem('po_number') as HTMLInputElement).value = po;
          track('begin_checkout', { source, currency: 'USD', value });
          handoff.submit();
        }
        // If the chain didn't fire, the status line above already carries
        // the quote link, and /quote/<token> is the retry path.
      } else {
        status.textContent = body.error ?? 'Something went wrong. Email contact@biokea.ai.';
        status.style.color = PINK;
      }
    } catch {
      status.textContent = 'Network error. Please email contact@biokea.ai.';
      status.style.color = PINK;
    }
  });

  if (opts.service && isServiceSlug(opts.service)) {
    const radio = root.querySelector<HTMLInputElement>(`[data-service-choice="${opts.service}"]`);
    if (radio) {
      radio.checked = true;
      selectService(opts.service);
    }
  }
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
