// src/widget/entry.ts
//
// Bundle entry point. Built by vite.widget.config.ts into an IIFE at
// public/widget/quote.js (plus quote.css), so a host page only needs:
//   <link rel="stylesheet" href="https://biokea.ai/widget/quote.css">
//   <div id="quote-widget" data-source="store"></div>
//   <script src="https://biokea.ai/widget/quote.js" defer></script>
import './quote.css';
import { mountQuoteWidget, type QuoteWidget, type WidgetOptions } from './quote-widget';

// Replaced at build time from PUBLIC_TURNSTILE_SITE_KEY; '' means no
// Turnstile (local dev), in which case the widget renders no captcha and
// the API doesn't enforce one either.
declare const __TURNSTILE_SITE_KEY__: string;

export function mount(root: HTMLElement, opts: WidgetOptions = {}): QuoteWidget {
  return mountQuoteWidget(root, {
    turnstileSiteKey: __TURNSTILE_SITE_KEY__ || undefined,
    ...opts,
  });
}

declare global {
  interface Window {
    BioKEAQuote?: { mount: typeof mount };
  }
}

window.BioKEAQuote = { mount };

function autoMount(): void {
  const el = document.getElementById('quote-widget');
  if (!el || el.dataset.bkMounted === '1') return;
  el.dataset.bkMounted = '1';
  mount(el, { source: el.dataset.source || 'site' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoMount);
} else {
  autoMount();
}
