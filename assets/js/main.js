/* rajatranjan.github.io: motion and interaction.
   Everything here is progressive; the page reads fine without it. */
(() => {
  'use strict';

  const doc = document;
  const html = doc.documentElement;
  const $ = (s, c = doc) => c.querySelector(s);
  const $$ = (s, c = doc) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  // frame-rate independent smoothing factor
  const ease = (k, dt) => 1 - Math.pow(1 - k, dt / 16.67);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wide = matchMedia('(min-width: 901px)');
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const INTRO = html.classList.contains('intro') ? 1250 : 150; // mirrors --intro in CSS

  html.classList.add('js-ready');
  if (html.classList.contains('intro')) setTimeout(() => html.classList.add('intro-done'), 2100);

  let vw = innerWidth;
  let vh = innerHeight;
  addEventListener('resize', () => { vw = innerWidth; vh = innerHeight; }, { passive: true });

  /* ---------- a single frame loop for everything that moves ---------- */
  const tasks = [];
  let last = performance.now();
  let looping = false;
  const loop = (now) => {
    const dt = Math.min(50, now - last);
    last = now;
    for (let i = 0; i < tasks.length; i++) tasks[i](now, dt);
    if (doc.hidden) { looping = false; return; }
    requestAnimationFrame(loop);
  };
  const startLoop = () => {
    if (looping) return;
    looping = true;
    last = performance.now();
    requestAnimationFrame(loop);
  };
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) startLoop(); });

  /* =============================================================
     Theme
     ============================================================= */
  const themeMeta = $('meta[name="theme-color"]');
  const toggle = $('#theme-toggle');
  const themeHooks = [];
  const currentTheme = () => html.getAttribute('data-theme') || (mqDark.matches ? 'dark' : 'light');
  const themeChanged = () => {
    const paper = getComputedStyle(html).getPropertyValue('--paper').trim();
    if (themeMeta && paper) themeMeta.setAttribute('content', paper);
    if (toggle) toggle.setAttribute('aria-pressed', currentTheme() === 'dark' ? 'true' : 'false');
    themeHooks.forEach((fn) => fn());
  };
  mqDark.addEventListener('change', () => { if (!html.getAttribute('data-theme')) themeChanged(); });

  if (toggle) {
    toggle.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      const apply = () => {
        html.setAttribute('data-theme', next);
        try { localStorage.setItem('rr-theme', next); } catch (_) { /* private mode */ }
        themeChanged();
      };
      if (reduced || !doc.startViewTransition) {
        html.classList.add('theme-fade');
        apply();
        setTimeout(() => html.classList.remove('theme-fade'), 500);
        return;
      }
      // ink spreads out from the switch
      const r = toggle.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const end = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));
      const vt = doc.startViewTransition(apply);
      vt.ready.then(() => {
        html.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
          { duration: 800, easing: 'cubic-bezier(.76,0,.24,1)', pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(() => {});
    });
  }

  /* =============================================================
     Text splitting
     ============================================================= */
  function splitWords(root, cls) {
    const out = [];
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          const frag = doc.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(' ')); return; }
            const w = doc.createElement('span');
            w.className = cls;
            const inner = doc.createElement('span');
            inner.textContent = part;
            inner.style.setProperty('--i', i++);
            w.appendChild(inner);
            frag.appendChild(w);
            out.push(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1 && child.namespaceURI !== 'http://www.w3.org/2000/svg') {
          walk(child);
        }
      });
    };
    walk(root);
    return out;
  }

  function splitLetters(el) {
    const text = el.textContent;
    el.textContent = '';
    Array.from(text).forEach((ch, i) => {
      const s = doc.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      s.style.setProperty('--i', i);
      el.appendChild(s);
    });
  }

  const h1 = $('h1[data-split]');
  if (h1) {
    if (!reduced) splitWords(h1, 'w');
    h1.classList.add('is-split');
  }
  $$('[data-letters]').forEach(splitLetters);

  /* =============================================================
     Scramble (nav hover) — monospace, so nothing reflows
     ============================================================= */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
  const glyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
  function scramble(el) {
    if (reduced || el._scrambling) return;
    const final = el.dataset.label || el.textContent;
    el.dataset.label = final;
    el._scrambling = true;
    const total = 16;
    let frame = 0;
    const step = () => {
      frame++;
      let s = '';
      for (let i = 0; i < final.length; i++) {
        const settle = total * 0.35 + (i / final.length) * total * 0.65;
        s += frame >= settle || final[i] === ' ' ? final[i] : glyph();
      }
      el.textContent = s;
      if (frame < total) requestAnimationFrame(step);
      else { el.textContent = final; el._scrambling = false; }
    };
    requestAnimationFrame(step);
  }
  $$('[data-scramble]').forEach((el) => el.addEventListener('pointerenter', () => scramble(el)));

  /* =============================================================
     Background: a field of graphite dots
     - ambient waves drift through it
     - the cursor pushes dots aside and leaves a trail of ink
     - clicks send ripples (red ones mark the sheet)
     ============================================================= */
  const field = (() => {
    const canvas = $('#field');
    if (!canvas || !canvas.getContext) return null;
    const ctx = canvas.getContext('2d');
    const TAU = Math.PI * 2;
    const LEVELS = 7;
    const PAR = 0.25; // scroll parallax
    const ink = new Map();
    const ripples = [];
    const lv = Array.from({ length: LEVELS }, () => []);
    const reds = [];
    const col = { dot: '#6E7780', ink: '#17242C', mark: '#B93B26', base: 0.26 };
    const p = { x: -1e4, y: -1e4, lx: -1e4, ly: -1e4, speed: 0 };
    let W = 0, H = 0, S = 26, cols = 0, rows = 0, ox = 0;
    let lastAuto = 0, lastMove = 0;

    const colors = () => {
      const cs = getComputedStyle(html);
      col.dot = cs.getPropertyValue('--graphite').trim() || col.dot;
      col.ink = cs.getPropertyValue('--ink').trim() || col.ink;
      col.mark = cs.getPropertyValue('--mark').trim() || col.mark;
      col.base = currentTheme() === 'dark' ? 0.2 : 0.26;
      if (reduced) draw(0);
    };

    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = innerWidth;
      H = innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      S = W < 640 ? 22 : W > 1800 ? 30 : 26;
      cols = Math.ceil(W / S) + 1;
      rows = Math.ceil(H / S) + 2;
      ox = (W - (cols - 1) * S) / 2;
      if (reduced) draw(0);
    };

    const ripple = (x, y, red) => {
      if (reduced) return;
      ripples.push({ x, wy: y + scrollY * PAR, t0: performance.now(), red: !!red, r: 0, life: 1 });
      if (ripples.length > 6) ripples.shift();
    };

    function draw(now) {
      const off = reduced ? 0 : scrollY * PAR;
      const r0 = Math.floor(off / S) - 1;

      const sp = p.lx < -9e3 ? 0 : Math.hypot(p.x - p.lx, p.y - p.ly);
      p.lx = p.x; p.ly = p.y;
      p.speed = lerp(p.speed, sp, 0.35);
      const deposit = Math.min(1, p.speed / 16);

      if (ink.size) ink.forEach((v, k) => { v *= 0.955; if (v < 0.02) ink.delete(k); else ink.set(k, v); });

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const age = now - rp.t0;
        rp.r = age * 0.42;
        rp.life = 1 - age / 2600;
        if (rp.life <= 0) ripples.splice(i, 1);
      }

      // when nobody is touching it, the page still breathes
      if (!reduced && now - lastAuto > 4800 && now - lastMove > 3000) {
        lastAuto = now;
        ripple(W * (0.12 + Math.random() * 0.76), H * (0.15 + Math.random() * 0.7), Math.random() < 0.4);
      }

      for (let i = 0; i < LEVELS; i++) lv[i].length = 0;
      reds.length = 0;

      const R = fine ? 130 : 90;
      const R2 = R * R;
      const t = reduced ? 0 : now;

      for (let r = r0; r < r0 + rows; r++) {
        const wy = r * S;
        const y0 = wy - off;
        for (let c = 0; c < cols; c++) {
          const x0 = ox + c * S;
          let x = x0, y = y0;

          const n = Math.sin(x0 * 0.0105 + t * 0.00055) *
                    Math.sin(wy * 0.0123 - t * 0.00042 + Math.sin(x0 * 0.0037 + t * 0.00021) * 2.2);
          let I = n > 0.5 ? (n - 0.5) * 0.55 : 0;
          let red = 0;

          const dx = x0 - p.x, dy = y0 - p.y;
          if (dx < R && dx > -R && dy < R && dy > -R) {
            const d2 = dx * dx + dy * dy;
            if (d2 < R2) {
              const d = Math.sqrt(d2) || 1;
              let f = 1 - d / R;
              f *= f;
              x += (dx / d) * f * 12;
              y += (dy / d) * f * 12;
              if (f * 0.5 > I) I = f * 0.5;
              if (deposit > 0.04 && f > 0.2) {
                const k = r * 4096 + c;
                ink.set(k, Math.min(1, (ink.get(k) || 0) + f * deposit * 0.3));
              }
            }
          }
          if (ink.size) {
            const v = ink.get(r * 4096 + c);
            if (v && v > I) I = v;
          }
          for (let q = 0; q < ripples.length; q++) {
            const rp = ripples[q];
            const ddx = x0 - rp.x, ddy = wy - rp.wy;
            const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
            const k = 1 - Math.abs(d - rp.r) / 50;
            if (k > 0) {
              const a = k * rp.life;
              if (rp.red) { if (a > red) red = a; } else if (a * 0.85 > I) I = a * 0.85;
              x += (ddx / d) * k * 8 * rp.life;
              y += (ddy / d) * k * 8 * rp.life;
            }
          }
          if (red > 0.1) reds.push(x, y, red);
          else lv[Math.min(LEVELS - 1, (I * LEVELS) | 0)].push(x, y);
        }
      }

      ctx.clearRect(0, 0, W, H);
      for (let L = 0; L < LEVELS; L++) {
        const a = lv[L];
        if (!a.length) continue;
        const k = L / (LEVELS - 1);
        const rad = 0.95 + k * 2.4;
        ctx.globalAlpha = col.base + k * (0.9 - col.base);
        ctx.fillStyle = L < 2 ? col.dot : col.ink;
        ctx.beginPath();
        for (let i = 0; i < a.length; i += 2) {
          ctx.moveTo(a[i] + rad, a[i + 1]);
          ctx.arc(a[i], a[i + 1], rad, 0, TAU);
        }
        ctx.fill();
      }
      if (reds.length) {
        ctx.fillStyle = col.mark;
        for (let b = 0; b < 3; b++) {
          const lo = 0.1 + b * 0.3, hi = lo + 0.3;
          const rad = 1.2 + (lo + 0.15) * 2.8;
          ctx.globalAlpha = 0.35 + b * 0.3;
          ctx.beginPath();
          for (let i = 0; i < reds.length; i += 3) {
            const v = reds[i + 2];
            if (v < lo || (v >= hi && b < 2)) continue;
            ctx.moveTo(reds[i] + rad, reds[i + 1]);
            ctx.arc(reds[i], reds[i + 1], rad, 0, TAU);
          }
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    addEventListener('pointermove', (e) => {
      p.x = e.clientX;
      p.y = e.clientY;
      if (p.lx < -9e3) { p.lx = p.x; p.ly = p.y; }
      lastMove = performance.now();
    }, { passive: true });
    const away = () => { p.x = p.y = p.lx = p.ly = -1e4; };
    doc.addEventListener('mouseout', (e) => { if (!e.relatedTarget) away(); });
    addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') away(); });
    addEventListener('pointercancel', away);
    addEventListener('pointerdown', (e) => {
      if (e.target.closest('a, button')) return;
      ripple(e.clientX, e.clientY, e.pointerType === 'mouse');
      lastMove = performance.now();
    });

    resize();
    colors();
    addEventListener('resize', resize, { passive: true });
    themeHooks.push(colors);
    if (!reduced) tasks.push((now) => draw(now));
    return { ripple };
  })();

  /* =============================================================
     Custom cursor
     ============================================================= */
  if (fine && !reduced) {
    const cur = $('.cursor');
    const ring = $('.cursor-ring');
    const dot = $('.cursor-dot');
    let x = -100, y = -100, rx = -100, ry = -100, seen = false;
    html.classList.add('has-cursor');
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      if (!seen) { rx = x; ry = y; seen = true; cur.classList.remove('is-hidden'); }
      dot.style.transform = `translate3d(${x}px,${y}px,0)`;
    }, { passive: true });
    doc.addEventListener('mouseout', (e) => {
      if (!e.relatedTarget) { cur.classList.add('is-hidden'); seen = false; }
    });
    doc.addEventListener('pointerover', (e) => {
      const t = e.target;
      if (!t.closest) return;
      const onGrid = !!t.closest('.grid');
      cur.classList.toggle('is-grid', onGrid);
      cur.classList.toggle('is-link', !onGrid && !!t.closest('a, button'));
    });
    addEventListener('pointerdown', () => cur.classList.add('is-down'));
    addEventListener('pointerup', () => cur.classList.remove('is-down'));
    tasks.push((now, dt) => {
      if (!seen) return;
      const k = ease(0.2, dt);
      rx = lerp(rx, x, k);
      ry = lerp(ry, y, k);
      ring.style.transform = `translate3d(${rx.toFixed(1)}px,${ry.toFixed(1)}px,0)`;
    });
  }

  /* =============================================================
     Magnetic buttons and links
     ============================================================= */
  if (fine && !reduced) {
    $$('[data-magnetic]').forEach((el) => {
      const k = parseFloat(el.dataset.magnetic) || 0.3;
      let box = null;
      el.addEventListener('pointerenter', () => {
        el.style.transform = '';
        box = el.getBoundingClientRect();
      });
      el.addEventListener('pointermove', (e) => {
        if (!box) box = el.getBoundingClientRect();
        const mx = e.clientX - (box.left + box.width / 2);
        const my = e.clientY - (box.top + box.height / 2);
        el.style.transform = `translate(${(mx * k).toFixed(1)}px,${(my * k).toFixed(1)}px)`;
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; box = null; });
    });
  }

  /* =============================================================
     The answer sheet
     ============================================================= */
  (() => {
    const grid = $('#grid');
    if (!grid) return;
    const EXAM = new Date(2027, 4, 2); // 2 May 2027, approximate NEET date
    const MS = 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.max(0, Math.round((EXAM - today) / MS));
    const countEl = $('#count');
    const readout = $('#readout');
    const markedEl = $('#marked');
    const roll = $('#roll');
    const idle = fine ? 'Point at a day.' : 'Tap a day.';
    const fmtN = (n) => n.toLocaleString('en-IN');
    readout.textContent = idle;
    markedEl.textContent = fine ? 'click to mark' : 'tap to mark';

    // barcode, seeded so it's the same on every visit
    const bc = $('#barcode');
    if (bc) {
      let seed = 2027;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 26; i++) {
        const s = doc.createElement('i');
        s.style.width = (1 + Math.round(rnd() * 2.2)) + 'px';
        bc.appendChild(s);
      }
    }

    // roll-number style digits: one row of 0-9 bubbles per digit
    const digits = String(days).split('');
    const rows = digits.map(() => {
      const row = doc.createElement('span');
      row.className = 'roll-row';
      const box = doc.createElement('span');
      box.className = 'roll-d';
      box.textContent = '·';
      row.appendChild(box);
      const bs = [];
      for (let n = 0; n < 10; n++) {
        const b = doc.createElement('span');
        b.className = 'rb';
        b.textContent = n;
        row.appendChild(b);
        bs.push(b);
      }
      roll.appendChild(row);
      return { box, bs };
    });
    const markRoll = () => {
      digits.forEach((d, k) => {
        setTimeout(() => {
          rows[k].box.textContent = d;
          rows[k].bs[+d].classList.add('on');
        }, reduced ? 0 : k * 220);
      });
    };

    // count up to the number of days
    const countStart = INTRO + 700;
    if (reduced) {
      countEl.textContent = fmtN(days);
      markRoll();
    } else {
      countEl.textContent = '0';
      setTimeout(() => {
        const t0 = performance.now();
        const dur = 1600;
        const step = (now) => {
          const k = clamp((now - t0) / dur, 0, 1);
          const e = 1 - Math.pow(1 - k, 4);
          countEl.textContent = fmtN(Math.round(days * e));
          if (k < 1) requestAnimationFrame(step);
          else markRoll();
        };
        requestAnimationFrame(step);
      }, countStart);
    }

    // one bubble per day
    const fmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const frag = doc.createDocumentFragment();
    const stagger = days ? Math.min(6, 900 / days) : 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(today.getTime() + i * MS);
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'bub' + (i === 0 ? ' today' : d.getDate() === 1 ? ' month' : '');
      b.dataset.label = fmt.format(d) + '  ·  ' + (i === 0 ? 'today' : i + ' days out');
      b.setAttribute('aria-hidden', 'true');
      b.tabIndex = -1;
      if (!reduced) b.style.setProperty('--d', Math.round(INTRO + 500 + i * stagger) + 'ms');
      frag.appendChild(b);
    }
    grid.appendChild(frag);
    setTimeout(() => grid.classList.add('settled'), reduced ? 0 : INTRO + 2400);

    grid.addEventListener('pointerover', (e) => {
      if (e.target.classList.contains('bub')) readout.textContent = e.target.dataset.label;
    });
    grid.addEventListener('pointerleave', () => { readout.textContent = idle; clearDust(); });

    // mark a day: it fills in and the mark echoes through the page
    let marked = 0;
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.bub');
      if (!b) return;
      b.classList.toggle('marked');
      marked += b.classList.contains('marked') ? 1 : -1;
      markedEl.textContent = marked ? `${marked} marked` : (fine ? 'click to mark' : 'tap to mark');
      readout.textContent = b.dataset.label;
      if (field) {
        const r = b.getBoundingClientRect();
        field.ripple(r.left + r.width / 2, r.top + r.height / 2, true);
      }
    });

    // graphite dust: bubbles darken as the cursor sweeps past them
    let bubs = [], spots = [], lit = [], queued = false, px = 0, py = 0;
    const RADIUS = 52;
    const measure = () => {
      bubs = Array.from(grid.children);
      spots = bubs.map((b) => ({ x: b.offsetLeft + b.offsetWidth / 2, y: b.offsetTop + b.offsetHeight / 2 }));
    };
    const clearDust = () => {
      for (let i = 0; i < lit.length; i++) { lit[i].classList.remove('near'); lit[i].style.opacity = ''; }
      lit = [];
    };
    const paint = () => {
      queued = false;
      clearDust();
      for (let i = 0; i < spots.length; i++) {
        const dx = spots[i].x - px, dy = spots[i].y - py;
        if (dx > RADIUS || dx < -RADIUS || dy > RADIUS || dy < -RADIUS) continue;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > RADIUS) continue;
        const b = bubs[i];
        b.classList.add('near');
        b.style.opacity = (0.45 + 0.55 * (1 - d / RADIUS)).toFixed(2);
        lit.push(b);
      }
    };
    if (!reduced) {
      measure();
      addEventListener('resize', measure, { passive: true });
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
      grid.addEventListener('pointermove', (e) => {
        const r = grid.getBoundingClientRect();
        px = e.clientX - r.left;
        py = e.clientY - r.top;
        if (!queued) { queued = true; requestAnimationFrame(paint); }
      }, { passive: true });

      // the first mark of the day sends a ripple across the page
      if (field) {
        setTimeout(() => {
          const r = grid.getBoundingClientRect();
          if (r.bottom > 0 && r.top < vh) field.ripple(r.left + r.width / 2, r.top + r.height / 2, true);
        }, INTRO + 900);
      }
    }
  })();

  /* =============================================================
     Sheet tilt + glare
     ============================================================= */
  (() => {
    const sheet = $('#sheet');
    const stage = $('.sheet-stage');
    if (!sheet || !stage || !fine || reduced) return;
    const glare = $('.glare', sheet);
    let tx = 0, ty = 0, cx = 0, cy = 0, go = 0, goT = 0, gx = 50, gy = 0;
    const zone = $('.hero-visual') || stage;
    zone.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width;
      const ny = (e.clientY - r.top) / r.height;
      tx = clamp((nx - 0.5) * 2, -1.2, 1.2);
      ty = clamp((ny - 0.5) * 2, -1.2, 1.2);
      gx = nx * 100;
      gy = ny * 100;
      goT = 1;
    });
    zone.addEventListener('pointerleave', () => { tx = ty = 0; goT = 0; });
    tasks.push((now, dt) => {
      const k = ease(0.08, dt);
      const ncx = lerp(cx, tx, k), ncy = lerp(cy, ty, k), ngo = lerp(go, goT, k);
      if (Math.abs(ncx - cx) + Math.abs(ncy - cy) + Math.abs(ngo - go) < 0.0004) return;
      cx = ncx; cy = ncy; go = ngo;
      sheet.style.transform = `rotateX(${(-cy * 7).toFixed(2)}deg) rotateY(${(cx * 9).toFixed(2)}deg)`;
      glare.style.opacity = go.toFixed(3);
      glare.style.setProperty('--gx', gx.toFixed(1) + '%');
      glare.style.setProperty('--gy', gy.toFixed(1) + '%');
    });
  })();

  /* =============================================================
     Reveals
     ============================================================= */
  const reveal = (el) => {
    el.classList.add('is-in');
    // drop the clip once it has opened, so hover shadows aren't cut off
    setTimeout(() => el.classList.add('is-done'), reduced ? 0 : 1500);
  };
  const revealTargets = $$('[data-reveal]');
  if (reduced || !('IntersectionObserver' in window)) {
    revealTargets.forEach(reveal);
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    // the footer name sits at the very bottom of the page, so any sliver counts
    const ioEdge = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { reveal(en.target); ioEdge.unobserve(en.target); }
      });
    }, { threshold: 0 });
    revealTargets.forEach((el) => (el.dataset.reveal === 'giant' ? ioEdge : io).observe(el));
  }

  /* =============================================================
     Scroll: progress pencil, header, parallax, word-by-word ink
     ============================================================= */
  const header = $('#masthead');
  const pencil = $('#pencil');
  const heroCopy = $('.hero-copy');
  const heroVisual = $('.hero-visual');
  const scrubEl = $('.scrub');
  const scrubWords = scrubEl && !reduced ? splitWords(scrubEl, 'sw') : [];
  const scrubState = scrubWords.map(() => -1);
  let lastY = -1;
  let vel = 0;

  const scrub = () => {
    if (!scrubWords.length) return;
    const r = scrubEl.getBoundingClientRect();
    const prog = clamp((vh * 0.88 - r.top) / (vh * 0.42 + r.height), 0, 1);
    const n = scrubWords.length;
    for (let i = 0; i < n; i++) {
      const o = Math.round(clamp(prog * (n + 2) - i, 0, 1) * 20) / 20;
      if (o === scrubState[i]) continue;
      scrubState[i] = o;
      scrubWords[i].style.opacity = (0.14 + 0.86 * o).toFixed(2);
      scrubWords[i].classList.toggle('lit', o > 0.6);
    }
  };

  tasks.push((now, dt) => {
    const y = scrollY;
    const dy = lastY < 0 ? 0 : y - lastY;
    vel = lerp(vel, dy / Math.max(dt, 1) * 16.67, ease(0.18, dt));
    if (y === lastY) return;
    lastY = y;

    if (header) {
      header.classList.toggle('is-scrolled', y > 12);
      const focusInside = header.contains(doc.activeElement);
      if (y > 160 && dy > 4 && !focusInside) header.classList.add('is-hidden');
      else if (dy < -4 || y < 160) header.classList.remove('is-hidden');
    }
    if (pencil && !reduced) {
      const max = doc.documentElement.scrollHeight - vh;
      pencil.style.transform = `scaleX(${max > 0 ? clamp(y / max, 0, 1).toFixed(4) : 0})`;
    }
    if (!reduced && wide.matches && heroCopy && y < vh * 1.4) {
      heroCopy.style.transform = `translate3d(0,${(y * 0.22).toFixed(1)}px,0)`;
      heroCopy.style.opacity = (1 - clamp(y / (vh * 0.85), 0, 1) * 0.9).toFixed(3);
      heroVisual.style.transform = `translate3d(0,${(y * 0.1).toFixed(1)}px,0)`;
    } else if (heroCopy && heroCopy.style.transform && !wide.matches) {
      heroCopy.style.transform = heroCopy.style.opacity = heroVisual.style.transform = '';
    }
    scrub();
  });
  addEventListener('resize', () => { lastY = -1; }, { passive: true });

  /* =============================================================
     Crossed tapes: marquee that speeds up with your scroll
     ============================================================= */
  if (!reduced) {
    $$('.tape').forEach((tape, k) => {
      const track = $('.tape-track', tape);
      const seg = $('.tape-seg', track);
      if (!track || !seg) return;
      const dir = k % 2 ? 1 : -1;
      let segW = 0, x = 0, visible = true;
      const fill = () => {
        while (track.children.length > 1) track.lastChild.remove();
        segW = seg.getBoundingClientRect().width;
        if (!segW) return;
        const need = Math.ceil(tape.getBoundingClientRect().width / segW) + 1;
        for (let i = 0; i < need; i++) track.appendChild(seg.cloneNode(true));
        x = dir > 0 ? -segW : 0;
      };
      fill();
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fill);
      addEventListener('resize', fill, { passive: true });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(tape);
      }
      tasks.push((now, dt) => {
        if (!visible || !segW) return;
        const speed = 55 + Math.min(Math.abs(vel) * 9, 900);
        x += dir * (vel < -0.5 ? -1 : 1) * speed * (dt / 1000);
        if (x <= -segW) x += segW;
        if (x > 0) x -= segW;
        const skew = clamp(vel * 0.25, -8, 8);
        track.style.transform = `translate3d(${x.toFixed(1)}px,0,0) skewX(${(-dir * skew).toFixed(2)}deg)`;
      });
    });
  }

  /* =============================================================
     Card spotlight
     ============================================================= */
  if (fine) {
    $$('.item').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
  }

  /* =============================================================
     Pacer: fall three days behind, watch the plan bend
     ============================================================= */
  (() => {
    const root = $('#bend');
    if (!root) return;
    const colsEl = $('.bend-cols', root);
    const status = $('.bend-status', root);
    const N = 14, BASE = 0.5, DONE = 4, MISS = [4, 5, 6];
    const cells = [];
    for (let i = 0; i < N; i++) {
      const c = doc.createElement('div');
      c.className = 'bc';
      c.innerHTML = '<span class="track"><i class="bar-x"></i><i class="bar"></i></span><b class="dot"></b>';
      colsEl.appendChild(c);
      cells.push(c);
    }
    const ahead = N - (MISS[MISS.length - 1] + 1);
    const extra = (BASE * MISS.length) / ahead;
    const setStatus = (txt, cls) => { status.textContent = txt; status.className = 'bend-status' + (cls ? ' ' + cls : ''); };
    const reset = () => {
      cells.forEach((c) => {
        c.className = 'bc';
        c.style.setProperty('--h', BASE);
        c.style.setProperty('--x', 0);
      });
      setStatus('on track');
    };
    const finalState = () => {
      cells.forEach((c, i) => {
        if (i < DONE) c.classList.add('done');
        if (MISS.includes(i)) { c.classList.add('miss'); c.style.setProperty('--h', 0.04); }
        if (i > MISS[MISS.length - 1]) c.style.setProperty('--x', extra.toFixed(3));
      });
      setStatus('bent, not broken', 'bent');
    };
    reset();
    if (reduced) { finalState(); return; }

    let timers = [], on = false;
    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    const run = () => {
      timers.forEach(clearTimeout);
      timers = [];
      reset();
      let t = 600;
      for (let i = 0; i < DONE; i++) { const c = cells[i]; at(t, () => c.classList.add('done')); t += 260; }
      t += 250;
      MISS.forEach((i, n) => {
        const c = cells[i];
        at(t, () => {
          c.classList.add('miss');
          c.style.setProperty('--h', 0.04);
          setStatus(`${n + 1} day${n ? 's' : ''} behind`, 'behind');
        });
        t += 360;
      });
      t += 600;
      at(t, () => {
        for (let i = MISS[MISS.length - 1] + 1; i < N; i++) {
          const c = cells[i];
          c.style.setProperty('--td', (i - MISS[MISS.length - 1] - 1) * 70 + 'ms');
          c.style.setProperty('--x', extra.toFixed(3));
        }
        setStatus('bent, not broken', 'bent');
      });
      t += 3600;
      at(t, () => root.classList.add('fading'));
      t += 500;
      at(t, () => { root.classList.remove('fading'); if (on) run(); });
    };
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting && !on) { on = true; run(); }
      else if (!en.isIntersecting && on) { on = false; timers.forEach(clearTimeout); timers = []; root.classList.remove('fading'); }
    }, { threshold: 0.4 }).observe(root);
  })();

  /* =============================================================
     Diary: ciphertext that decrypts under your cursor
     ============================================================= */
  (() => {
    const root = $('#vault');
    if (!root) return;
    const out = $('.vault-text', root);
    const hint = $('.vault-hint', root);
    const lockLabel = $('.lock em', root);
    const plain = out.dataset.plain || out.textContent;
    const CIPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const rnd = () => CIPH[(Math.random() * CIPH.length) | 0];
    const cipher = Array.from(plain).map((ch) => (ch === ' ' ? ' ' : rnd()));
    const pt = doc.createElement('span');
    const ct = doc.createElement('span');
    pt.className = 'pt';
    ct.className = 'ct';
    out.textContent = '';
    out.append(pt, ct);
    hint.textContent = fine ? 'hover to decrypt' : 'tap to decrypt';

    let p = 0, target = 0, raf = 0, hovering = false, lastT = 0;
    const render = () => {
      const n = p | 0;
      pt.textContent = plain.slice(0, n);
      for (let k = 0; k < 4; k++) {
        const j = n + ((Math.random() * 10) | 0);
        if (j < cipher.length && cipher[j] !== ' ') cipher[j] = rnd();
      }
      ct.textContent = cipher.slice(n).join('');
    };
    const tick = (now) => {
      const dt = lastT ? Math.min(64, now - lastT) : 16.67;
      lastT = now;
      const speed = (plain.length / (target > p ? 900 : 550)) * dt;
      p = target > p ? Math.min(target, p + speed) : Math.max(target, p - speed);
      render();
      const open = target > 0 && p === target;
      root.classList.toggle('is-open', open);
      lockLabel.textContent = open ? 'decrypted' : 'encrypted';
      if (p !== target) raf = requestAnimationFrame(tick);
      else { raf = 0; lastT = 0; }
    };
    const set = (open) => {
      target = open ? plain.length : 0;
      if (reduced) { p = target; tick(performance.now()); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    render();

    if (fine) {
      root.addEventListener('pointerenter', () => { hovering = true; set(true); });
      root.addEventListener('pointerleave', () => { hovering = false; set(false); });
    } else {
      root.addEventListener('click', () => set(target === 0));
    }
    // decrypt once on its own the first time it scrolls into view
    if (!reduced && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        setTimeout(() => {
          if (hovering) return;
          set(true);
          setTimeout(() => { if (!hovering) set(false); }, 2800);
        }, 700);
      }, { threshold: 0.6 });
      io.observe(root);
    }
  })();

  /* =============================================================
     CTA: fill spreads from wherever the cursor enters
     ============================================================= */
  $$('.cta').forEach((el) => {
    const setXY = (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', (e.clientX - r.left).toFixed(0) + 'px');
      el.style.setProperty('--y', (e.clientY - r.top).toFixed(0) + 'px');
    };
    el.addEventListener('pointerenter', setXY);
    el.addEventListener('pointerleave', setXY);
  });

  /* =============================================================
     Footer: Varanasi time, and a name that glows under the cursor
     ============================================================= */
  const clock = $('#clock');
  if (clock) {
    try {
      const fmtT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const tick = () => { clock.textContent = fmtT.format(new Date()); };
      tick();
      setInterval(tick, 1000);
    } catch (_) { /* no Intl time zones */ }
  }
  const foot = $('#foot');
  const giant = $('.giant');
  if (foot && giant && fine) {
    foot.addEventListener('pointermove', (e) => {
      const r = giant.getBoundingClientRect();
      giant.style.setProperty('--fx', (e.clientX - r.left).toFixed(0) + 'px');
      giant.style.setProperty('--fy', (e.clientY - r.top).toFixed(0) + 'px');
    });
  }

  themeChanged();
  startLoop();
})();
