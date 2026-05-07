// public/golden-sample/overlay.js
//
// Shared in-game overlay for the Golden Sample 26 hunt. Injected into
// every BioKEA game's index.html by scripts/build-games.mjs. The
// games dispatch `window.dispatchEvent(new CustomEvent('biokea:golden-found', {
//   detail: { word, slot, sentence, alreadyHeld }
// }))` and this overlay renders the moment.
//
// Vanilla JS, no framework. Self-contained. Idempotent if loaded
// twice (we early-return when a singleton flag is set).
//
// Visuals: the actual /assets/images/golden-sample-card.png is shown
// front-and-center (the same ornate gold/navy card players see on
// /golden-sample-26), with the player's earned word stamped over it
// as a wax-seal-style overlay.
//
// I won't tell. That would be cheating.

(function () {
  if (window.__biokeaGoldenSampleLoaded) return;
  window.__biokeaGoldenSampleLoaded = true;

  const STORAGE_KEY = 'biokea:golden-tickets:v1';
  const SENTENCE_FALLBACK = 'Every Human Now Has Scientific Superpowers';
  const CARD_IMG = '/assets/images/golden-sample-card.png';

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
      // localStorage full / private mode — server has the canonical record
    }
  }

  // ─── Audio ───────────────────────────────────────────────────
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
        0%   { transform: translate(-50%, -50%) scale(0.4) rotate(-10deg); opacity: 0; }
        55%  { transform: translate(-50%, -50%) scale(1.04) rotate(2deg);  opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1) rotate(0deg);     opacity: 1; }
      }
      @keyframes biokea-golden-glow {
        0%   { transform: translate(-50%, -50%) scale(0.2); opacity: 0;   }
        40%  { transform: translate(-50%, -50%) scale(1.6); opacity: 0.95;}
        100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0;   }
      }
      @keyframes biokea-golden-spark {
        0%   { transform: translate(0, 0) scale(0.6); opacity: 1; }
        100% { transform: translate(var(--biokea-spark-x, 0), var(--biokea-spark-y, 0)) scale(0.1); opacity: 0; }
      }
      @keyframes biokea-golden-stampin {
        0%   { transform: translate(-50%, -50%) scale(2.2) rotate(-8deg); opacity: 0; }
        70%  { transform: translate(-50%, -50%) scale(0.96) rotate(-4deg); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1) rotate(-4deg);   opacity: 1; }
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
      'background:radial-gradient(ellipse at center, rgba(20,14,40,0.65) 0%, rgba(6,6,18,0.95) 100%)',
      'backdrop-filter:blur(6px)',
      'animation:biokea-golden-fadein 320ms ease both',
      'font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif',
    ].join(';');

    // Gold expanding glow behind the card.
    const glow = document.createElement('div');
    glow.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'width:680px',
      'height:680px',
      'border-radius:50%',
      'background:radial-gradient(circle, rgba(251,191,36,0.65) 0%, rgba(251,191,36,0.22) 38%, rgba(251,191,36,0) 70%)',
      'pointer-events:none',
      'animation:biokea-golden-glow 1200ms ease-out both',
    ].join(';');
    root.appendChild(glow);

    // Sparkle shower — small dots animating outward.
    for (let i = 0; i < 36; i++) {
      const sp = document.createElement('div');
      const angle = (Math.PI * 2 * i) / 36 + Math.random() * 0.4;
      const dist = 280 + Math.random() * 180;
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
        `animation:biokea-golden-spark ${800 + Math.random() * 700}ms ease-out ${100 + Math.random() * 250}ms both`,
      ].join(';');
      root.appendChild(sp);
    }

    // ── Modal container — holds card + framing chrome ──
    const modal = document.createElement('div');
    modal.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'transform:translate(-50%, -50%)',
      'width:min(620px, 94vw)',
      'animation:biokea-golden-cardin 720ms cubic-bezier(0.16, 1.2, 0.3, 1) both',
    ].join(';');

    // Card frame — wraps the image so we can position the wax-seal stamp
    // on top of it without affecting the rest of the layout.
    const cardFrame = document.createElement('div');
    cardFrame.style.cssText = [
      'position:relative',
      'border-radius:14px',
      'overflow:hidden',
      'box-shadow:0 30px 70px -10px rgba(180, 83, 9, 0.65), 0 0 0 1px rgba(251,191,36,0.55) inset',
    ].join(';');

    const cardImg = document.createElement('img');
    cardImg.src = CARD_IMG;
    cardImg.alt = 'Golden Sample Card — ornate gold and navy keepsake.';
    cardImg.style.cssText = 'display:block;width:100%;height:auto';
    // If the absolute path can't resolve (e.g. someone forks the game
    // outside the website domain), fall back to a navy gradient so the
    // stamp + framing still look intentional.
    cardImg.onerror = () => {
      cardFrame.style.background =
        'linear-gradient(135deg, #1f1505 0%, #b45309 50%, #fbbf24 100%)';
      cardImg.remove();
      cardFrame.style.aspectRatio = '1438 / 830';
    };
    cardFrame.appendChild(cardImg);

    // ── Wax-seal stamp with the earned word ──
    // Centered over the card image (which has a dark galaxy at center,
    // giving the cream-on-navy seal great contrast).
    const stamp = document.createElement('div');
    stamp.style.cssText = [
      'position:absolute',
      'left:50%',
      'top:50%',
      'transform:translate(-50%, -50%) rotate(-4deg)',
      'min-width:46%',
      'max-width:80%',
      'padding:14px 22px',
      'background:linear-gradient(150deg, #fef3c7 0%, #fbbf24 50%, #b45309 110%)',
      'color:#1f1505',
      'border:2px solid rgba(120,53,15,0.7)',
      'border-radius:6px',
      'box-shadow:0 12px 28px -4px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.5) inset, 0 0 0 4px rgba(120,53,15,0.25)',
      'text-align:center',
      'animation:biokea-golden-stampin 720ms cubic-bezier(0.16, 1.4, 0.3, 1) 320ms both',
    ].join(';');
    const stampLabel = document.createElement('div');
    stampLabel.style.cssText =
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;letter-spacing:0.32em;text-transform:uppercase;font-weight:700;color:rgba(120,53,15,0.85)';
    stampLabel.textContent = `Slot ${slot} of 6`;
    const stampWord = document.createElement('div');
    stampWord.style.cssText = [
      'margin-top:4px',
      'font-size:clamp(28px, 6vw, 44px)',
      'font-weight:900',
      'letter-spacing:0.04em',
      'color:#1f1505',
      'text-shadow:0 1px 0 rgba(255,255,255,0.5)',
      'line-height:1',
    ].join(';');
    stampWord.textContent = word;
    stamp.appendChild(stampLabel);
    stamp.appendChild(stampWord);
    cardFrame.appendChild(stamp);

    modal.appendChild(cardFrame);

    // ── Below the card: sentence visualization + CTA ──
    const below = document.createElement('div');
    below.style.cssText = [
      'margin-top:18px',
      'padding:18px 22px',
      'background:rgba(15, 23, 42, 0.85)',
      'border:1px solid rgba(251, 191, 36, 0.35)',
      'border-radius:10px',
      'text-align:center',
      'color:#fde68a',
      'backdrop-filter:blur(4px)',
    ].join(';');

    const eyebrow = document.createElement('div');
    eyebrow.style.cssText =
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;letter-spacing:0.28em;text-transform:uppercase;color:#fbbf24;font-weight:600';
    eyebrow.textContent = `Golden Sample · ${slot} of 6 earned`;

    const sentenceRow = document.createElement('div');
    sentenceRow.style.cssText =
      'display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:12px';
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
          ? 'background:#fbbf24;color:#1f1505;font-weight:800'
          : isOwned
            ? 'background:rgba(251,191,36,0.18);color:#fde68a;font-weight:600'
            : 'background:rgba(251,191,36,0.08);color:rgba(253,230,138,0.4)',
      ].join(';');
      chip.textContent = isOwned ? w : '·····';
      sentenceRow.appendChild(chip);
    });

    const ctaRow = document.createElement('div');
    ctaRow.style.cssText =
      'display:flex;align-items:center;justify-content:center;gap:14px;margin-top:14px;flex-wrap:wrap';

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.style.cssText = [
      'background:#fbbf24',
      'color:#1f1505',
      'border:none',
      'padding:10px 18px',
      'border-radius:4px',
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace',
      'font-size:11px',
      'letter-spacing:0.18em',
      'text-transform:uppercase',
      'font-weight:800',
      'cursor:pointer',
      'transition:transform 120ms ease, background 120ms ease',
    ].join(';');
    cta.textContent = 'Got it';

    const collectionLink = document.createElement('a');
    collectionLink.href = 'https://biokea.ai/mission/games/golden-sample-26';
    collectionLink.target = '_top';
    collectionLink.rel = 'noopener';
    collectionLink.style.cssText =
      'font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#fbbf24;text-decoration:none;border-bottom:1px solid rgba(251,191,36,0.35);padding-bottom:1px';
    const earnedTotal =
      Object.keys(tickets).length + (tickets[String(slot)] ? 0 : 1);
    collectionLink.textContent = `View collection · ${earnedTotal} of 6 →`;

    ctaRow.appendChild(cta);
    ctaRow.appendChild(collectionLink);

    below.appendChild(eyebrow);
    below.appendChild(sentenceRow);
    below.appendChild(ctaRow);

    modal.appendChild(below);
    root.appendChild(modal);

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
    // Always persist the ticket to localStorage, even on already-held
    // replays. This rehydrates the collection wall after a multi-
    // device scenario or a localStorage clear — without it the player
    // would see ✓ instead of the word on /mission/games/golden-sample-26.
    saveTicket(detail.slot, {
      slot: detail.slot,
      game: detail.game ?? null,
      word: detail.word,
      token: detail.token ?? null,
      issued_at: detail.issued_at ?? new Date().toISOString(),
    });
    if (detail.alreadyHeld) {
      showToast('Golden sample already collected');
      return;
    }
    showReveal(detail);
  });
})();
