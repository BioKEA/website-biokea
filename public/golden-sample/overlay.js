// public/golden-sample/overlay.js
//
// Shared in-game overlay for the Golden Sample 26 hunt. Injected into
// every BioKEA game's index.html by scripts/build-games.mjs. The
// games stay free of any reveal logic — they just dispatch
// `window.dispatchEvent(new CustomEvent('biokea:golden-found', {
//   detail: { word, slot, sentence, alreadyHeld }
// }))` and this overlay renders the moment.
//
// Vanilla JS, no framework. Self-contained. Idempotent if loaded
// twice (we early-return when a singleton flag is set).
//
// I won't tell. That would be cheating.

(function () {
  if (window.__biokeaGoldenSampleLoaded) return;
  window.__biokeaGoldenSampleLoaded = true;

  const STORAGE_KEY = 'biokea:golden-tickets:v1';
  const SENTENCE_FALLBACK = 'Every Human Now Has Scientific Superpowers';

  // ─── Storage ─────────────────────────────────────────────────
  function loadTickets() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function saveTicket(slot, payload) {
    try {
      const all = loadTickets();
      all[String(slot)] = payload;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch {
      /* localStorage full / private mode — not load-bearing, the
         server has the canonical record. */
    }
  }

  // ─── Audio ───────────────────────────────────────────────────
  // A short 3-note triumphant arpeggio synthesized via WebAudio so we
  // don't have to ship a sound file. Fades in/out so it doesn't punch
  // through whatever music the game was already playing.
  function playChime() {
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return;
    }
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const t = now + i * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.5);
    });
    // Low-frequency thud underneath, gives the moment weight.
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = 120;
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.25, now + 0.04);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    sub.connect(subGain).connect(ctx.destination);
    sub.start(now);
    sub.stop(now + 0.65);
    // Close the context after the sound is done so we don't pile up
    // contexts on repeated reveals.
    setTimeout(() => ctx.close().catch(() => undefined), 800);
  }

  // ─── Style injection ─────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('biokea-golden-style')) return;
    const style = document.createElement('style');
    style.id = 'biokea-golden-style';
    style.textContent = `
      @keyframes biokea-golden-fadein {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes biokea-golden-cardin {
        0%   { transform: translate(-50%, -50%) scale(0.4) rotate(-12deg); opacity: 0; }
        60%  { transform: translate(-50%, -50%) scale(1.06) rotate(2deg);  opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1) rotate(0deg);     opacity: 1; }
      }
      @keyframes biokea-golden-glow {
        0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0;   }
        40%  { transform: translate(-50%, -50%) scale(1.4); opacity: 0.95;}
        100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0;   }
      }
      @keyframes biokea-golden-spark {
        0%   { transform: translate(0, 0) scale(0.6); opacity: 1; }
        100% { transform: translate(var(--biokea-spark-x, 0), var(--biokea-spark-y, 0)) scale(0.1); opacity: 0; }
      }
      @keyframes biokea-golden-wordin {
        0%   { letter-spacing: 0.5em; opacity: 0; transform: translateY(8px); }
        60%  { letter-spacing: 0.05em; opacity: 1; transform: translateY(0); }
        100% { letter-spacing: 0.02em; opacity: 1; transform: translateY(0); }
      }
      .biokea-golden-toast {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.92);
        color: #fbbf24;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        padding: 8px 16px;
        border-radius: 4px;
        border: 1px solid rgba(251, 191, 36, 0.35);
        z-index: 2147483647;
        pointer-events: none;
        animation: biokea-golden-fadein 240ms ease both;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Reveal modal ────────────────────────────────────────────
  function showReveal(detail) {
    ensureStyles();
    const word = String(detail.word ?? '').toUpperCase();
    const slot = Number(detail.slot ?? 0);
    const sentence = String(detail.sentence ?? SENTENCE_FALLBACK);
    const sentenceWords = sentence.split(' ');

    const root = document.createElement('div');
    root.setAttribute('data-biokea-golden', '');
    root.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483646',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'background:radial-gradient(ellipse at center, rgba(20,14,40,0.55) 0%, rgba(6,6,18,0.92) 100%)',
      'backdrop-filter:blur(4px)',
      'animation:biokea-golden-fadein 320ms ease both',
      'font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
    ].join(';');

    // Gold expanding glow behind the card.
    const glow = document.createElement('div');
    glow.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:560px',
      'height:560px',
      'border-radius:50%',
      'background:radial-gradient(circle, rgba(251,191,36,0.55) 0%, rgba(251,191,36,0.18) 38%, rgba(251,191,36,0) 70%)',
      'pointer-events:none',
      'animation:biokea-golden-glow 1100ms ease-out both',
    ].join(';');
    root.appendChild(glow);

    // Sparkles — small dots that animate outward.
    for (let i = 0; i < 28; i++) {
      const sp = document.createElement('div');
      const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
      const dist = 220 + Math.random() * 140;
      sp.style.cssText = [
        'position:absolute',
        'left:50%',
        'top:50%',
        'width:6px',
        'height:6px',
        'border-radius:50%',
        'background:#fde68a',
        'box-shadow:0 0 8px rgba(251,191,36,0.9)',
        'pointer-events:none',
        `--biokea-spark-x:${Math.cos(angle) * dist}px`,
        `--biokea-spark-y:${Math.sin(angle) * dist}px`,
        `animation:biokea-golden-spark ${800 + Math.random() * 600}ms ease-out ${100 + Math.random() * 200}ms both`,
      ].join(';');
      root.appendChild(sp);
    }

    // The card itself.
    const card = document.createElement('div');
    card.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:min(420px, 88vw)',
      'padding:32px 28px 28px',
      'background:linear-gradient(160deg, #fef3c7 0%, #fbbf24 55%, #b45309 105%)',
      'color:#1f1505',
      'border:2px solid rgba(120,53,15,0.45)',
      'border-radius:14px',
      'box-shadow:0 20px 60px -10px rgba(180, 83, 9, 0.55), 0 0 0 1px rgba(255,255,255,0.4) inset',
      'text-align:center',
      'animation:biokea-golden-cardin 700ms cubic-bezier(0.16, 1.2, 0.3, 1) both',
    ].join(';');

    const eyebrow = document.createElement('div');
    eyebrow.style.cssText =
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;color:rgba(120,53,15,0.85);font-weight:600';
    eyebrow.textContent = `Golden Sample · ${slot} of 6`;

    const title = document.createElement('div');
    title.style.cssText =
      'margin-top:6px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(120,53,15,0.6)';
    title.textContent = 'You earned a piece of the message';

    const wordEl = document.createElement('div');
    wordEl.style.cssText = [
      'margin:24px 0 18px',
      'font-size:clamp(34px, 7vw, 52px)',
      'font-weight:800',
      'letter-spacing:0.02em',
      'color:#1f1505',
      'text-shadow:0 1px 0 rgba(255,255,255,0.55)',
      'animation:biokea-golden-wordin 800ms ease-out 350ms both',
    ].join(';');
    wordEl.textContent = word;

    // Mini sentence visualization — show all 6 word slots, light up
    // the one we just earned, fade the rest.
    const sentenceRow = document.createElement('div');
    sentenceRow.style.cssText =
      'display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-bottom:18px';
    const tickets = loadTickets();
    sentenceWords.forEach((w, i) => {
      const slotNum = i + 1;
      const isThis = slotNum === slot;
      const isOwned = !!tickets[String(slotNum)] || isThis;
      const chip = document.createElement('span');
      chip.style.cssText = [
        'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
        'font-size:11px',
        'padding:3px 8px',
        'border-radius:3px',
        'letter-spacing:0.06em',
        isThis
          ? 'background:#1f1505;color:#fde68a;font-weight:700'
          : isOwned
            ? 'background:rgba(120,53,15,0.18);color:rgba(31,21,5,0.95);font-weight:600'
            : 'background:rgba(120,53,15,0.08);color:rgba(31,21,5,0.45)',
      ].join(';');
      chip.textContent = isOwned ? w : '·····';
      sentenceRow.appendChild(chip);
    });

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.style.cssText = [
      'margin-top:6px',
      'background:#1f1505',
      'color:#fde68a',
      'border:none',
      'padding:10px 18px',
      'border-radius:4px',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
      'font-size:11px',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'font-weight:700',
      'cursor:pointer',
      'transition:transform 120ms ease, background 120ms ease',
    ].join(';');
    cta.textContent = 'Got it';

    const footer = document.createElement('a');
    footer.href = 'https://biokea.ai/golden-sample-26';
    footer.target = '_top';
    footer.rel = 'noopener';
    footer.style.cssText =
      'display:block;margin-top:14px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:rgba(120,53,15,0.85);text-decoration:none';
    const earnedTotal =
      Object.keys(tickets).length + (tickets[String(slot)] ? 0 : 1);
    footer.textContent = `View collection · ${earnedTotal} of 6`;

    card.appendChild(eyebrow);
    card.appendChild(title);
    card.appendChild(wordEl);
    card.appendChild(sentenceRow);
    card.appendChild(cta);
    card.appendChild(footer);
    root.appendChild(card);

    function dismiss() {
      root.style.transition = 'opacity 240ms ease';
      root.style.opacity = '0';
      setTimeout(() => root.remove(), 260);
    }
    cta.addEventListener('click', dismiss);
    root.addEventListener('click', (e) => {
      if (e.target === root) dismiss();
    });
    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') {
        dismiss();
        document.removeEventListener('keydown', onKey);
      }
    });

    document.body.appendChild(root);
    // Small delay so the modal is on screen before the chime plays —
    // feels more synced.
    setTimeout(playChime, 80);
  }

  function showToast(message) {
    ensureStyles();
    const t = document.createElement('div');
    t.className = 'biokea-golden-toast';
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity 320ms ease';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 340);
    }, 2200);
  }

  // ─── Event listener ──────────────────────────────────────────
  window.addEventListener('biokea:golden-found', (ev) => {
    const detail = ev && ev.detail ? ev.detail : {};
    if (!detail.word || !detail.slot) return;
    if (detail.alreadyHeld) {
      showToast('Golden sample already collected');
      return;
    }
    // Persist the token + word locally so the collection wall on
    // /golden-sample-26 lights up even if the player goes there
    // directly from this game.
    saveTicket(detail.slot, {
      slot: detail.slot,
      game: detail.game ?? null,
      word: detail.word,
      token: detail.token ?? null,
      issued_at: detail.issued_at ?? new Date().toISOString(),
    });
    showReveal(detail);
  });
})();
