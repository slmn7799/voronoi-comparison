/*
 * geometry.js — Shared geometric primitives and data structures.
 *
 * Every algorithm in this project returns the same result shape so the two
 * constructions can be checked against each other and drawn by the same code:
 *
 *   {
 *     sites:    [{x, y, id}],                       input points (deduplicated)
 *     vertices: [{x, y}],                           Voronoi vertices
 *     edges:    [{s1, s2, a:{x,y}, b:{x,y}}],       Voronoi edges clipped to the
 *                                                   bounding box; s1/s2 are the ids
 *                                                   of the two sites the edge separates
 *     pairs:    Set of "i-j" (i < j)                neighbouring sites (= Delaunay edges)
 *   }
 */
(function (root) {
  'use strict';

  const EPS = 1e-9;

  function point(x, y, id) {
    return { x: x, y: y, id: id };
  }

  /** Remove exact/near duplicate points and give every site a stable id. */
  function prepareSites(raw) {
    const seen = new Set();
    const out = [];
    for (const p of raw) {
      const key = Math.round(p.x * 1e6) + ',' + Math.round(p.y * 1e6);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(point(p.x, p.y, out.length));
    }
    return out;
  }

  /** Orientation test: > 0 if a, b, c turn counter-clockwise (in a y-up frame). */
  function orient(a, b, c) {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  }

  /** Centre of the circle through a, b, c, or null if they are collinear. */
  function circumcenter(a, b, c) {
    const bx = b.x - a.x, by = b.y - a.y;
    const cx = c.x - a.x, cy = c.y - a.y;
    const d = 2 * (bx * cy - by * cx);
    if (Math.abs(d) < 1e-12) return null;
    const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    return { x: a.x + (cy * b2 - by * c2) / d, y: a.y + (bx * c2 - cx * b2) / d };
  }

  function dist2(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function pairKey(i, j) {
    return i < j ? i + '-' + j : j + '-' + i;
  }

  /** Axis-aligned box around the sites with a margin, used for clipping infinite edges. */
  function boundingBox(sites, margin) {
    let xl = Infinity, xr = -Infinity, yt = Infinity, yb = -Infinity;
    for (const s of sites) {
      if (s.x < xl) xl = s.x;
      if (s.x > xr) xr = s.x;
      if (s.y < yt) yt = s.y;
      if (s.y > yb) yb = s.y;
    }
    if (!isFinite(xl)) return { xl: 0, xr: 1, yt: 0, yb: 1 };
    const m = margin === undefined ? Math.max(xr - xl, yb - yt, 1) * 0.1 : margin;
    return { xl: xl - m, xr: xr + m, yt: yt - m, yb: yb + m };
  }

  /** Liang–Barsky clipping of segment p→q to the box. Returns [p', q'] or null. */
  function clipSegment(p, q, box) {
    let t0 = 0, t1 = 1;
    const dx = q.x - p.x, dy = q.y - p.y;
    const tests = [
      [-dx, p.x - box.xl],
      [dx, box.xr - p.x],
      [-dy, p.y - box.yt],
      [dy, box.yb - p.y]
    ];
    for (const [pp, qq] of tests) {
      if (Math.abs(pp) < 1e-15) {
        if (qq < 0) return null;
      } else {
        const r = qq / pp;
        if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
        else { if (r < t0) return null; if (r < t1) t1 = r; }
      }
    }
    return [
      { x: p.x + t0 * dx, y: p.y + t0 * dy },
      { x: p.x + t1 * dx, y: p.y + t1 * dy }
    ];
  }

  /** A distance far enough that a point that far from any site is outside the box. */
  function farDistance(box) {
    const w = box.xr - box.xl, h = box.yb - box.yt;
    return 4 * Math.sqrt(w * w + h * h) + 1;
  }

  /** Seeded PRNG (mulberry32) so test point sets are reproducible. */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomPoints(n, width, height, seed, pad) {
    const r = rng(seed === undefined ? Date.now() : seed);
    const m = pad === undefined ? 0.06 : pad;
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push({
        x: width * (m + (1 - 2 * m) * r()),
        y: height * (m + (1 - 2 * m) * r())
      });
    }
    return pts;
  }

  const api = {
    EPS, point, prepareSites, orient, circumcenter, dist2, pairKey,
    boundingBox, clipSegment, farDistance, rng, randomPoints
  };

  root.Geometry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
