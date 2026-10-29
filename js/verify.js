/*
 * verify.js — Correctness checks.
 *
 * 1. Brute force (small n): a pair of sites are Voronoi neighbours iff they share
 *    a Delaunay triangle, i.e. a triangle whose circumcircle contains no other site.
 *    We enumerate all O(n^3) triangles and test each against all sites, O(n^4).
 * 2. Vertex check: every Voronoi vertex must be equidistant from its three nearest
 *    sites, with no site strictly closer (the empty-circle property).
 * 3. Agreement: Fortune and divide-and-conquer must produce the same neighbour pairs.
 */
(function (root) {
  'use strict';

  const G = root.Geometry || (typeof require !== 'undefined' ? require('./geometry.js') : null);

  /**
   * Sites i and j are Voronoi neighbours (sharing an edge of positive length) iff some
   * circle through both has every other site strictly outside it. Circle centres lie on
   * the bisector c(t) = mid + t*u; each other site k rules out a half-line of t, so the
   * pair is adjacent iff the remaining open interval is non-empty. O(n^3) overall, and
   * exact for degenerate input (co-circular / collinear points) up to a small tolerance.
   */
  function bruteForcePairs(sites) {
    const n = sites.length;
    const pairs = new Set();
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = sites[i], q = sites[j];
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
        const ux = -(q.y - p.y), uy = q.x - p.x;     // bisector direction (length |pq|)
        const scale = ux * ux + uy * uy;
        let lo = -Infinity, hi = Infinity, ok = true;
        for (let k = 0; k < n && ok; k++) {
          if (k === i || k === j) continue;
          const s = sites[k];
          const A = G.dist2(m, s) - G.dist2(m, p);
          const B = 2 * (ux * (p.x - s.x) + uy * (p.y - s.y));
          if (Math.abs(B) < 1e-12 * scale) { if (A <= 1e-9 * scale) ok = false; continue; }
          const t = -A / B;
          if (B > 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
          if (lo >= hi - 1e-9) ok = false;
        }
        if (ok) pairs.add(G.pairKey(p.id, q.id));
      }
    }
    return pairs;
  }

  function checkVertices(sites, vertices) {
    let worst = 0;
    for (const v of vertices) {
      const d = sites.map((s) => Math.sqrt(G.dist2(s, v))).sort((a, b) => a - b);
      if (d.length < 3) continue;
      const scale = Math.max(1, d[2]);
      worst = Math.max(worst, (d[2] - d[0]) / scale);
    }
    return worst;
  }

  /** Every clipped edge's midpoint must be equidistant from its two sites, with no site closer. */
  function checkEdges(sites, edges) {
    const byId = new Map(sites.map((s) => [s.id, s]));
    let worst = 0;
    for (const e of edges) {
      const m = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 };
      const d1 = Math.sqrt(G.dist2(m, byId.get(e.s1)));
      const d2 = Math.sqrt(G.dist2(m, byId.get(e.s2)));
      let dmin = Infinity;
      for (const s of sites) dmin = Math.min(dmin, Math.sqrt(G.dist2(m, s)));
      const scale = Math.max(1, d1);
      worst = Math.max(worst, Math.abs(d1 - d2) / scale, (d1 - dmin) / scale);
    }
    return worst;
  }

  function setDiff(a, b) {
    const out = [];
    for (const x of a) if (!b.has(x)) out.push(x);
    return out;
  }

  function compareSets(a, b) {
    return { onlyA: setDiff(a, b), onlyB: setDiff(b, a) };
  }

  /** Run one test case; returns { ok, message }. */
  function runCase(name, rawPoints, opts) {
    opts = opts || {};
    const sites = G.prepareSites(rawPoints);
    const box = G.boundingBox(sites);
    const f = root.Fortune.build(sites, { box });
    const dc = root.DivideConquer.build(sites, { box });
    const problems = [];

    const agree = compareSets(f.pairs, dc.pairs);
    if (agree.onlyA.length || agree.onlyB.length) {
      problems.push('Fortune vs D&C disagree (only Fortune: ' + agree.onlyA.slice(0, 4).join(', ') +
        '; only D&C: ' + agree.onlyB.slice(0, 4).join(', ') + ')');
    }
    if (opts.brute !== false && sites.length <= 40) {
      const bf = bruteForcePairs(sites);
      for (const [label, res] of [['Fortune', f], ['D&C', dc]]) {
        const c = compareSets(res.pairs, bf);
        if (c.onlyA.length || c.onlyB.length) {
          problems.push(label + ' vs brute force: ' + c.onlyA.length + ' extra, ' + c.onlyB.length + ' missing');
        }
      }
    }
    if (sites.length <= 400) {
      for (const [label, res] of [['Fortune', f], ['D&C', dc]]) {
        const err = checkVertices(sites, res.vertices);
        if (err > 1e-6) problems.push(label + ' vertex not equidistant (rel err ' + err.toExponential(2) + ')');
        const eerr = checkEdges(sites, res.edges);
        if (eerr > 1e-6) problems.push(label + ' edge geometry wrong (rel err ' + eerr.toExponential(2) + ')');
      }
    }
    // Euler check on the neighbour graph of a non-degenerate triangulation: E <= 3n - 6.
    if (sites.length >= 3 && f.pairs.size > 3 * sites.length - 6) {
      problems.push('too many edges for a planar graph');
    }
    return {
      name, n: sites.length, ok: problems.length === 0,
      edges: f.pairs.size, message: problems.join(' | ') || 'OK'
    };
  }

  function testSuite() {
    const cases = [];
    const add = (name, pts, opts) => cases.push([name, pts, opts]);

    add('2 points', [{ x: 10, y: 10 }, { x: 50, y: 40 }]);
    add('3 points (triangle)', [{ x: 10, y: 10 }, { x: 80, y: 20 }, { x: 40, y: 70 }]);
    add('3 collinear points', [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 20 }]);
    add('5 collinear points (horizontal)', [0, 1, 2, 3, 4].map((i) => ({ x: i * 10, y: 5 })));
    add('5 collinear points (vertical)', [0, 1, 2, 3, 4].map((i) => ({ x: 5, y: i * 10 })));
    add('4 points, two share the top y', [{ x: 10, y: 0 }, { x: 60, y: 0 }, { x: 30, y: 40 }, { x: 70, y: 55 }]);
    add('duplicates are removed', [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 9 }, { x: 9, y: 2 }]);
    for (let s = 1; s <= 30; s++) {
      add('random n=' + (4 + s) + ' (seed ' + s + ')', G.randomPoints(4 + s, 800, 600, s));
    }
    add('random n=200 (seed 99)', G.randomPoints(200, 800, 600, 99));
    add('random n=2000 (seed 7)', G.randomPoints(2000, 800, 600, 7));
    // Integer grid jitter: many near-degenerate configurations.
    const grid = [];
    const r = G.rng(5);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
      grid.push({ x: i * 50 + r() * 3, y: j * 50 + r() * 3 });
    }
    add('jittered 6x5 grid', grid);

    add('square (4 co-circular points)', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    for (let s = 1; s <= 5; s++) {
      const R = G.rng(1000 + s), pts = [];
      for (let i = 0; i < 25; i++) pts.push({ x: Math.floor(R() * 8) * 10, y: Math.floor(R() * 8) * 10 });
      add('integer lattice, degenerate (seed ' + s + ')', pts);
    }
    return cases.map(([name, pts, opts]) => runCase(name, pts, opts));
  }

  const api = { bruteForcePairs, checkVertices, checkEdges, runCase, testSuite };
  root.Verify = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
