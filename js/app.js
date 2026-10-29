/*
 * app.js — Step-by-step visualization of both constructions.
 */
(function () {
  'use strict';

  const G = window.Geometry;
  const W = 800, H = 600;
  const BOX = { xl: 0, xr: W, yt: 0, yb: H };
  const MAX_POINTS = 200;

  const $ = (id) => document.getElementById(id);
  const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1);

  /* ---------------- colours from CSS tokens ---------------- */

  let C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['paper', 'ink', 'muted', 'line', 'site', 'edge', 'beach', 'sweep', 'vert',
      'circle', 'left', 'right', 'chain', 'ghost', 'delaunay', 'accent', 'bg']) {
      C[k] = cs.getPropertyValue('--' + k).trim();
    }
  }
  readColors();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); redrawAll(); });
  new MutationObserver(() => { readColors(); redrawAll(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------------- canvas helpers ---------------- */

  function setupCanvas(cv) {
    const ctx = cv.getContext('2d');
    const obj = { cv, ctx, scale: 1 };
    const resize = () => {
      const r = cv.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, Math.round(r.width * dpr));
      cv.height = Math.max(1, Math.round(r.height * dpr));
      obj.scale = (r.width / W) * dpr;
      obj.px = 1 / ((r.width / W));          // one CSS pixel in world units
      redrawAll();
    };
    new ResizeObserver(resize).observe(cv);
    return obj;
  }

  function begin(c) {
    const { ctx, cv, scale } = c;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.paper;
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    return ctx;
  }

  function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

  function drawEdges(c, edges, color, width, filter) {
    const ctx = c.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width * c.px;
    ctx.beginPath();
    for (const e of edges) {
      if (filter && !filter(e)) continue;
      ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
    }
    ctx.stroke();
  }

  function dot(c, p, r, fill, stroke) {
    const ctx = c.ctx;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * c.px, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5 * c.px; ctx.stroke(); }
  }

  function drawSites(c, sites, styleFn) {
    for (const s of sites) {
      const st = styleFn ? styleFn(s) : null;
      if (st === false) continue;
      dot(c, s, st && st.r || 3.2, st ? st.fill : C.site, st ? st.stroke : null);
    }
  }

  function toWorld(c, ev) {
    const r = c.cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }

  /* ---------------- state ---------------- */

  let rawPoints = [];
  let sites = [];
  let F = null;        // Fortune result with recorded steps
  let D = null;        // D&C result with recorded steps
  let dFrames = [];
  let view = 'fortune';

  const cF = setupCanvas($('cvFortune'));
  const cD = setupCanvas($('cvDC'));
  const cCF = setupCanvas($('cvCmpF'));
  const cCD = setupCanvas($('cvCmpD'));

  function recompute(keepProgress) {
    sites = G.prepareSites(rawPoints);
    F = sites.length >= 1 ? Fortune.build(sites, { box: BOX, record: true }) : null;
    D = sites.length >= 2 ? DivideConquer.build(sites, { box: BOX, record: true }) : null;

    dFrames = [];
    if (D) {
      for (const st of D.steps) {
        if (st.type === 'base') dFrames.push({ kind: 'base', st });
        else { dFrames.push({ kind: 'pre', st }); dFrames.push({ kind: 'post', st }); }
      }
    }
    dFrames.push({ kind: 'final' });

    fLmax = Math.max(H, F && F.steps.length ? F.steps[F.steps.length - 1].y + 8 : H);
    if (!keepProgress) { fL = 0; dIdx = 0; }
    else { fL = Math.min(fL, fLmax); dIdx = dFrames.length - 1; }
    $('dSlider').max = dFrames.length - 1;
    syncFortuneSlider();
    $('dSlider').value = dIdx;
    computeCompare();
    redrawAll();
  }

  function newRandom() {
    let n = parseInt($('nPoints').value, 10) || 24;
    n = Math.max(2, Math.min(MAX_POINTS, n));
    $('nPoints').value = n;
    const seed = parseInt($('seed').value, 10) || 0;
    rawPoints = G.randomPoints(n, W, H, seed, 0.08);
    stopAll();
    recompute(false);
  }

  /* =========================================================
   *  Fortune view
   * ========================================================= */

  let fL = 0, fLmax = H, fPlaying = false;

  // x of the breakpoint between the arcs of lSite (left) and rSite (right), directrix d
  function bpX(lSite, rSite, d) {
    const rfocx = rSite.x, rfocy = rSite.y, pby2 = rfocy - d;
    if (!pby2) return rfocx;
    const lfocx = lSite.x, lfocy = lSite.y, plby2 = lfocy - d;
    if (!plby2) return lfocx;
    const hl = lfocx - rfocx, aby2 = 1 / pby2 - 1 / plby2, b = hl / plby2;
    if (aby2) {
      return (-b + Math.sqrt(b * b - 2 * aby2 *
        (hl * hl / (-2 * plby2) - lfocy + plby2 / 2 + rfocy - pby2 / 2))) / aby2 + rfocx;
    }
    return (rfocx + lfocx) / 2;
  }
  const parY = (s, x, d) => ((x - s.x) * (x - s.x) + s.y * s.y - d * d) / (2 * (s.y - d));

  function snapshotAt(L) {
    const st = F ? F.steps : [];
    let lo = 0, hi = st.length - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (st[m].y <= L + 1e-9) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans;
  }

  function drawFortune() {
    const c = cF, ctx = begin(c);
    if (!F) { drawSites(c, sites); return; }
    const L = fL;
    const idx = snapshotAt(L);
    const snap = idx >= 0 ? F.steps[idx] : null;

    if ($('fFinal').checked) drawEdges(c, F.edges, C.ghost, 1.2);

    if (snap) {
      const arcs = snap.arcs;
      const k = arcs.length;
      // breakpoints
      const bps = new Array(k).fill(null);
      for (let i = 1; i < k; i++) {
        const l = arcs[i - 1].site, r = arcs[i].site;
        const x = bpX(l, r, L);
        const f = Math.abs(r.y - L) > 1e-9 ? r : l;
        bps[i] = { x, y: Math.abs(f.y - L) > 1e-9 ? parY(f, x, L) : -1e6 };
      }

      // Voronoi edges: fixed vertices plus the breakpoints currently tracing them
      const ends = snap.edges.map((e) => {
        const p = [];
        if (e.va) p.push(e.va);
        if (e.vb) p.push(e.vb);
        return p;
      });
      for (let i = 1; i < k; i++) if (arcs[i].edge >= 0 && bps[i]) ends[arcs[i].edge].push(bps[i]);
      ctx.strokeStyle = C.edge;
      ctx.lineWidth = 2 * c.px;
      ctx.beginPath();
      for (const p of ends) {
        if (p.length < 2) continue;
        const cl = G.clipSegment(p[0], p[1], { xl: -5, xr: W + 5, yt: -5, yb: H + 5 });
        if (cl) { ctx.moveTo(cl[0].x, cl[0].y); ctx.lineTo(cl[1].x, cl[1].y); }
      }
      ctx.stroke();

      // pending circle events
      if ($('fCircles').checked) {
        ctx.setLineDash([4 * c.px, 4 * c.px]);
        ctx.strokeStyle = C.circle;
        ctx.lineWidth = 1.2 * c.px;
        for (const ce of snap.pending) {
          ctx.beginPath(); ctx.arc(ce.x, ce.y, ce.r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const ce of snap.pending) dot(c, { x: ce.x, y: ce.bottom }, 2.5, C.circle);
      }

      // beach line
      ctx.strokeStyle = C.beach;
      ctx.lineWidth = 2.4 * c.px;
      ctx.beginPath();
      for (let i = 0; i < k; i++) {
        const s = arcs[i].site;
        if (Math.abs(s.y - L) < 1e-9) {
          // a brand-new arc is a vertical ray from the site up to the arc above it
          let top = -10;
          for (let j = 0; j < k; j++) {
            if (j === i) continue;
            const o = arcs[j].site;
            if (Math.abs(o.y - L) > 1e-9) top = Math.max(top, parY(o, s.x, L));
          }
          ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, top);
          continue;
        }
        let xl = i === 0 ? 0 : bps[i].x, xr = i === k - 1 ? W : bps[i + 1].x;
        xl = Math.max(0, Math.min(W, xl)); xr = Math.max(0, Math.min(W, xr));
        if (xr <= xl) continue;
        const stepPx = 2 * c.px;
        let first = true;
        for (let x = xl; ; x += stepPx) {
          const xx = Math.min(x, xr);
          const y = Math.max(-50, parY(s, xx, L));
          if (first) { ctx.moveTo(xx, y); first = false; } else ctx.lineTo(xx, y);
          if (xx >= xr) break;
        }
      }
      ctx.stroke();

      // vertices found so far
      for (const v of snap.vertices) dot(c, v, 3.2, C.vert);

      // highlight the most recent event
      if (snap.type === 'site') {
        dot(c, snap.point, 9, null, C.beach);
      } else if (snap.extra) {
        ctx.strokeStyle = C.vert; ctx.lineWidth = 1.6 * c.px;
        ctx.beginPath(); ctx.arc(snap.extra.x, snap.extra.y, snap.extra.r, 0, Math.PI * 2); ctx.stroke();
        dot(c, { x: snap.extra.x, y: snap.extra.y }, 6, null, C.vert);
      }
    }

    // sites: filled once the sweep line has passed them
    drawSites(c, sites, (s) => (s.y <= L ? { fill: C.site } : { fill: C.paper, stroke: C.muted }));

    // sweep line
    if (L <= H) {
      ctx.strokeStyle = C.sweep; ctx.lineWidth = 1.6 * c.px;
      line(ctx, { x: 0, y: L }, { x: W, y: L });
    }

    // readout
    const total = F.steps.length;
    let html = 'sweep y = <b>' + fmt(L) + '</b>' + (L > H ? '  (below view)' : '') + '<br>';
    if (!snap) html += 'No events yet. ' + total + ' events ahead.<br>';
    else {
      html += 'event ' + (idx + 1) + ' / ' + total + ': ';
      html += snap.type === 'site'
        ? '<b>site</b> at (' + fmt(snap.point.x) + ', ' + fmt(snap.point.y) + ')'
        : '<b>circle</b> → vertex (' + fmt(snap.extra.x) + ', ' + fmt(snap.extra.y) + ')';
      html += '<br>arcs on beach line: ' + snap.arcs.length;
      html += '<br>pending circle events: ' + snap.pending.length;
      html += '<br>vertices found: ' + snap.vertices.length;
      if (idx === total - 1) html += '<br><b>all events processed</b>';
    }
    $('fInfo').innerHTML = html;
  }

  function syncFortuneSlider() { $('fSlider').value = Math.round(fL / fLmax * 1000); }

  function fortuneJump(dir) {
    stopFortune();
    if (!F || !F.steps.length) return;
    const st = F.steps;
    if (dir > 0) {
      const nxt = st.find((s) => s.y > fL + 1e-6);
      fL = nxt ? nxt.y : fLmax;
    } else {
      let prev = 0;
      for (const ev of st) { if (ev.y < fL - 1e-6) prev = ev.y; else break; }
      fL = prev;
    }
    syncFortuneSlider();
    drawFortune();
  }

  let lastT = 0;
  function tickFortune(t) {
    if (!fPlaying) return;
    const dt = lastT ? (t - lastT) / 1000 : 0;
    lastT = t;
    fL += dt * parseFloat($('fSpeed').value);
    if (fL >= fLmax) { fL = fLmax; stopFortune(); }
    syncFortuneSlider();
    drawFortune();
    if (fPlaying) requestAnimationFrame(tickFortune);
  }
  function playFortune() {
    if (fL >= fLmax) fL = 0;
    fPlaying = true; lastT = 0;
    $('fPlay').textContent = 'Pause';
    requestAnimationFrame(tickFortune);
  }
  function stopFortune() { fPlaying = false; $('fPlay').textContent = 'Play'; }

  $('fPlay').onclick = () => (fPlaying ? stopFortune() : playFortune());
  $('fNext').onclick = () => fortuneJump(1);
  $('fPrev').onclick = () => fortuneJump(-1);
  $('fSlider').oninput = (e) => { stopFortune(); fL = e.target.value / 1000 * fLmax; drawFortune(); };
  $('fCircles').onchange = drawFortune;
  $('fFinal').onchange = drawFortune;

  /* =========================================================
   *  Divide & conquer view
   * ========================================================= */

  let dIdx = 0, dPlaying = false, dTimer = null;

  function drawDC() {
    const c = cD, ctx = begin(c);
    const frame = dFrames[dIdx];
    const info = $('dInfo');
    const bar = $('recBar');
    if (!D || !frame) { drawSites(c, sites); info.textContent = 'Add at least two points.'; bar.innerHTML = ''; return; }

    const order = D.order, n = order.length;
    const rank = new Map(order.map((s, i) => [s.id, i]));
    const showDel = $('dDelaunay').checked;
    const fade = $('dFaded').checked;

    const drawDel = (segs, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1 * c.px;
      ctx.setLineDash([3 * c.px, 3 * c.px]);
      ctx.beginPath();
      for (const [a, b] of segs) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      ctx.stroke(); ctx.setLineDash([]);
    };

    let html = '';
    const total = dFrames.length;
    html += 'step ' + (dIdx + 1) + ' / ' + total + '<br>';

    if (frame.kind === 'final') {
      drawEdges(c, D.edges, C.edge, 2);
      if (showDel) drawDel(D.delaunay, C.delaunay);
      drawSites(c, sites);
      html += '<b>done</b>: full diagram<br>' + n + ' sites · ' + D.edges.length + ' edges · ' + D.vertices.length + ' vertices';
      bar.innerHTML = '<span style="flex:1;background:' + C.edge + '"></span>';
    } else {
      const st = frame.st;
      const inRange = (s) => { const r = rank.get(s.id); return r >= st.lo && r < st.hi; };
      const side = (s) => (rank.get(s.id) < st.mid ? 'L' : 'R');

      if (frame.kind === 'base') {
        drawEdges(c, st.merged.edges, C.edge, 2);
        if (showDel) drawDel(st.merged.delaunay, C.delaunay);
        drawSites(c, sites, (s) => inRange(s) ? { fill: C.site, r: 4 } : (fade ? { fill: C.ghost } : { fill: C.muted }));
        html += '<b>base case</b>: ' + (st.hi - st.lo) + ' sites (ranks ' + st.lo + '–' + (st.hi - 1) + ')<br>depth ' + st.depth +
          '<br>solved directly';
      } else {
        // dividing line
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1 * c.px; ctx.setLineDash([6 * c.px, 5 * c.px]);
        line(ctx, { x: st.splitX, y: 0 }, { x: st.splitX, y: H });
        ctx.setLineDash([]);

        if (frame.kind === 'pre') {
          drawEdges(c, st.left.edges, C.left, 2);
          drawEdges(c, st.right.edges, C.right, 2);
          if (showDel) { drawDel(st.left.delaunay, C.left); drawDel(st.right.delaunay, C.right); }
          html += '<b>before merge</b> at depth ' + st.depth + '<br>left: ' + (st.mid - st.lo) + ' sites · right: ' + (st.hi - st.mid) +
            ' sites<br>split at x = ' + fmt(st.splitX);
        } else {
          const chain = st.merged.edges.filter((e) => e.cross);
          drawEdges(c, st.merged.edges, C.edge, 1.6, (e) => !e.cross);
          drawEdges(c, chain, C.chain, 3.2);
          if (showDel) drawDel(st.merged.delaunay, C.delaunay);
          html += '<b>after merge</b> at depth ' + st.depth + '<br>' + (st.hi - st.lo) + ' sites combined<br>dividing chain: ' +
            chain.length + ' segment' + (chain.length === 1 ? '' : 's');
        }
        drawSites(c, sites, (s) => {
          if (!inRange(s)) return fade ? { fill: C.ghost } : { fill: C.muted };
          return { fill: side(s) === 'L' ? C.left : C.right, r: 4 };
        });
      }
      const seg = (a, b, col) => (b > a ? '<span style="flex:' + (b - a) + ';background:' + col + '"></span>' : '');
      bar.innerHTML = seg(0, st.lo, 'transparent') +
        (frame.kind === 'base' ? seg(st.lo, st.hi, C.edge) : seg(st.lo, st.mid, C.left) + seg(st.mid, st.hi, C.right)) +
        seg(st.hi, n, 'transparent');
    }
    info.innerHTML = html;
  }

  function setDC(i) {
    dIdx = Math.max(0, Math.min(dFrames.length - 1, i));
    $('dSlider').value = dIdx;
    drawDC();
  }
  function playDC() {
    if (dIdx >= dFrames.length - 1) dIdx = 0;
    dPlaying = true; $('dPlay').textContent = 'Pause';
    const tick = () => {
      if (!dPlaying) return;
      if (dIdx >= dFrames.length - 1) { stopDC(); return; }
      setDC(dIdx + 1);
      dTimer = setTimeout(tick, 1000 / parseFloat($('dSpeed').value));
    };
    tick();
  }
  function stopDC() { dPlaying = false; clearTimeout(dTimer); $('dPlay').textContent = 'Play'; }

  $('dPlay').onclick = () => (dPlaying ? stopDC() : playDC());
  $('dNext').onclick = () => { stopDC(); setDC(dIdx + 1); };
  $('dPrev').onclick = () => { stopDC(); setDC(dIdx - 1); };
  $('dSlider').oninput = (e) => { stopDC(); setDC(parseInt(e.target.value, 10)); };
  $('dDelaunay').onchange = drawDC;
  $('dFaded').onchange = drawDC;

  /* =========================================================
   *  Side-by-side view
   * ========================================================= */

  let cmp = null;
  function timeIt(fn) {
    let reps = 1, t;
    for (;;) {
      const t0 = performance.now();
      for (let i = 0; i < reps; i++) fn();
      t = performance.now() - t0;
      if (t > 30 || reps >= 512) break;
      reps *= 4;
    }
    return t / reps;
  }
  function computeCompare() {
    if (sites.length < 2) { cmp = null; return; }
    let fr, dr;
    const tf = timeIt(() => { fr = Fortune.build(sites, { box: BOX }); });
    const td = timeIt(() => { dr = DivideConquer.build(sites, { box: BOX }); });
    let same = fr.pairs.size === dr.pairs.size;
    if (same) for (const p of fr.pairs) if (!dr.pairs.has(p)) { same = false; break; }
    cmp = { fr, dr, tf, td, same };
  }
  function drawCompare() {
    for (const [c, key] of [[cCF, 'fr'], [cCD, 'dr']]) {
      begin(c);
      if (cmp) drawEdges(c, cmp[key].edges, C.edge, 1.8);
      drawSites(c, sites);
    }
    const box = $('cmpStats');
    if (!cmp) { box.innerHTML = ''; return; }
    const stat = (k, v, cls) => '<div class="stat"><div class="k">' + k + '</div><div class="v ' + (cls || '') + '">' + v + '</div></div>';
    box.innerHTML =
      stat('Sites', sites.length) +
      stat('Voronoi edges (F / D&C)', cmp.fr.pairs.size + ' / ' + cmp.dr.pairs.size) +
      stat('Vertices (F / D&C)', cmp.fr.vertices.length + ' / ' + cmp.dr.vertices.length) +
      stat('Sweep-line time', cmp.tf < 1 ? (cmp.tf * 1000).toFixed(0) + ' µs' : cmp.tf.toFixed(2) + ' ms') +
      stat('D&C time', cmp.td < 1 ? (cmp.td * 1000).toFixed(0) + ' µs' : cmp.td.toFixed(2) + ' ms') +
      stat('Same diagram?', cmp.same ? 'yes ✓' : 'no ✗', cmp.same ? 'ok' : 'bad');
  }

  /* =========================================================
   *  Tests view
   * ========================================================= */

  $('btnTests').onclick = () => {
    $('testSummary').textContent = 'Running…';
    setTimeout(() => {
      const t0 = performance.now();
      const res = Verify.testSuite();
      const ms = performance.now() - t0;
      const passed = res.filter((r) => r.ok).length;
      $('testSummary').innerHTML = '<span class="' + (passed === res.length ? 'pass' : 'fail') + '">' +
        passed + ' / ' + res.length + ' passed</span> <span style="color:var(--muted);font-size:13px">(' + ms.toFixed(0) + ' ms)</span>';
      const tb = $('testTable').querySelector('tbody');
      tb.innerHTML = res.map((r) => '<tr><td>' + r.name + '</td><td>' + r.n + '</td><td>' + r.edges + '</td><td class="' +
        (r.ok ? 'pass' : 'fail') + '">' + (r.ok ? 'PASS' : 'FAIL — ' + r.message) + '</td></tr>').join('');
      $('testTable').hidden = false;
    }, 30);
  };

  /* =========================================================
   *  wiring
   * ========================================================= */

  function redrawAll() {
    if (!F && !D && !sites.length && !rawPoints.length) {
      // first paint before data exists
    }
    if (view === 'fortune') drawFortune();
    else if (view === 'dc') drawDC();
    else if (view === 'compare') drawCompare();
  }

  function stopAll() { stopFortune(); stopDC(); }

  document.querySelectorAll('.tab').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
      view = b.dataset.view;
      document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
      $('toolbar').style.display = view === 'tests' ? 'none' : '';
      stopAll();
      redrawAll();
    };
  });

  function addPoint(c, ev) {
    if (rawPoints.length >= MAX_POINTS) return;
    const p = toWorld(c, ev);
    rawPoints.push(p);
    stopAll();
    recompute(true);
    if (view === 'fortune') { fL = fLmax; syncFortuneSlider(); drawFortune(); }
  }
  for (const c of [cF, cD, cCF, cCD]) c.cv.addEventListener('click', (ev) => addPoint(c, ev));

  $('btnRandom').onclick = () => { $('seed').value = Math.floor(Math.random() * 100000); newRandom(); };
  $('nPoints').onchange = newRandom;
  $('seed').onchange = newRandom;
  $('btnClear').onclick = () => { rawPoints = []; stopAll(); recompute(false); };

  newRandom();
})();
