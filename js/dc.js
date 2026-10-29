/*
 * dc.js — Divide-and-conquer Voronoi construction.
 *
 * Follows Guibas & Stolfi (1985), the standard practical form of the
 * Shamos–Hoey divide-and-conquer algorithm:
 *
 *   1. Sort the sites by x.
 *   2. Split them into a left half and a right half at the median.
 *   3. Recursively build the diagram of each half.
 *   4. Merge: walk the "dividing chain" between the two halves from the
 *      bottom to the top, deleting the parts of each sub-diagram that are
 *      now closer to the other side.
 *
 * The structure is stored as its dual (the Delaunay triangulation) in a
 * quad-edge data structure, which makes the merge a clean zipper over
 * "cross edges". Every cross edge added during a merge is dual to exactly
 * one segment of the Voronoi dividing chain, so the Voronoi diagram — and
 * the dividing chain at every merge — is read straight off the result.
 *
 * Running time: O(n log n).
 */
(function (root) {
  'use strict';

  const G = root.Geometry || (typeof require !== 'undefined' ? require('./geometry.js') : null);

  /* ---------------- quad-edge data structure ---------------- */

  let quadCounter = 0;

  function makeEdge() {
    const q = [{}, {}, {}, {}];
    const id = quadCounter++;
    for (let i = 0; i < 4; i++) {
      q[i].rot = q[(i + 1) % 4];
      q[i].quad = id;
      q[i].org = null;
    }
    q[0].onext = q[0];
    q[2].onext = q[2];
    q[1].onext = q[3];
    q[3].onext = q[1];
    return q[0];
  }

  const sym = (e) => e.rot.rot;
  const invRot = (e) => e.rot.rot.rot;
  const oprev = (e) => e.rot.onext.rot;
  const lnext = (e) => invRot(e).onext.rot;
  const rprev = (e) => sym(e).onext;
  const dest = (e) => sym(e).org;

  function splice(a, b) {
    const alpha = a.onext.rot, beta = b.onext.rot;
    const t1 = b.onext, t2 = a.onext, t3 = beta.onext, t4 = alpha.onext;
    a.onext = t1; b.onext = t2; alpha.onext = t3; beta.onext = t4;
  }

  function connect(a, b) {
    const e = makeEdge();
    e.org = dest(a);
    sym(e).org = b.org;
    splice(e, lnext(a));
    splice(sym(e), b);
    return e;
  }

  function deleteEdge(e) {
    splice(e, oprev(e));
    splice(sym(e), oprev(sym(e)));
  }

  /* ---------------- predicates ---------------- */

  const ccw = (a, b, c) => G.orient(a, b, c) > 0;
  const rightOf = (p, e) => ccw(p, dest(e), e.org);
  const leftOf = (p, e) => ccw(p, e.org, dest(e));

  /** True if d lies strictly inside the circle through a, b, c (a, b, c counter-clockwise). */
  function inCircle(a, b, c, d) {
    const adx = a.x - d.x, ady = a.y - d.y;
    const bdx = b.x - d.x, bdy = b.y - d.y;
    const cdx = c.x - d.x, cdy = c.y - d.y;
    const ad = adx * adx + ady * ady;
    const bd = bdx * bdx + bdy * bdy;
    const cd = cdx * cdx + cdy * cdy;
    const det = adx * (bdy * cd - bd * cdy)
              - ady * (bdx * cd - bd * cdx)
              + ad * (bdx * cdy - bdy * cdx);
    return det > 1e-9;
  }

  /* ---------------- reading the Voronoi diagram off the quad-edges ---------------- */

  /** Collect every live directed edge reachable from e. */
  function collectEdges(e) {
    const seen = new Set();
    const out = [];
    const stack = [e];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      out.push(x);
      stack.push(sym(x), x.onext);
    }
    return out;
  }

  /**
   * Turn the triangulation reachable from `start` into Voronoi output.
   * crossSet (optional) marks Delaunay pairs that were added by the latest merge.
   */
  function toVoronoi(start, box, crossSet) {
    const directed = collectEdges(start);
    const far = G.farDistance(box);
    const face = new Map();           // directed edge -> circumcenter of its left triangle
    const vertices = [];

    for (const e of directed) {
      if (face.has(e)) continue;
      const e2 = lnext(e), e3 = lnext(e2);
      if (lnext(e3) === e && ccw(e.org, dest(e), dest(e2))) {
        const c = G.circumcenter(e.org, dest(e), dest(e2));
        if (c) {
          vertices.push(c);
          face.set(e, c); face.set(e2, c); face.set(e3, c);
        }
      }
    }

    const edges = [];
    const pairs = new Set();
    const delaunay = [];
    const doneQuad = new Set();

    for (const e of directed) {
      if (doneQuad.has(e.quad)) continue;
      doneQuad.add(e.quad);
      const a = e.org, b = dest(e);
      const key = G.pairKey(a.id, b.id);
      delaunay.push([a, b]);

      const L = face.get(e), R = face.get(sym(e));
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const nx = dy / len, ny = -dx / len;      // unit normal pointing to the right of a→b
      let p, q;
      if (L && R) { p = L; q = R; }
      else if (L) { p = L; q = { x: L.x + far * nx, y: L.y + far * ny }; }
      else if (R) { p = R; q = { x: R.x - far * nx, y: R.y - far * ny }; }
      else {
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        p = { x: m.x - far * nx, y: m.y - far * ny };
        q = { x: m.x + far * nx, y: m.y + far * ny };
      }
      if (G.dist2(p, q) < 1e-18) continue;      // zero-length (co-circular) edge
      pairs.add(key);
      const clipped = G.clipSegment(p, q, box);
      if (clipped) {
        edges.push({
          s1: a.id, s2: b.id, a: clipped[0], b: clipped[1],
          cross: crossSet ? crossSet.has(key) : false
        });
      }
    }
    return { vertices, edges, pairs, delaunay };
  }

  /* ---------------- the recursion ---------------- */

  function build(sites, opts) {
    opts = opts || {};
    const record = !!opts.record;
    const pts = sites.slice().sort((p, q) => p.x - q.x || p.y - q.y);
    const box = opts.box || G.boundingBox(pts);
    const steps = [];

    function rec(lo, hi, depth) {
      const n = hi - lo;
      let result;
      if (n === 2) {
        const a = makeEdge();
        a.org = pts[lo]; sym(a).org = pts[lo + 1];
        result = [a, sym(a)];
      } else if (n === 3) {
        const a = makeEdge(), b = makeEdge();
        const s1 = pts[lo], s2 = pts[lo + 1], s3 = pts[lo + 2];
        splice(sym(a), b);
        a.org = s1; sym(a).org = s2;
        b.org = s2; sym(b).org = s3;
        if (ccw(s1, s2, s3)) {
          connect(b, a);
          result = [a, sym(b)];
        } else if (ccw(s1, s3, s2)) {
          const c = connect(b, a);
          result = [sym(c), c];
        } else {
          result = [a, sym(b)];
        }
      } else {
        const mid = lo + (n >> 1);
        let [ldo, ldi] = rec(lo, mid, depth + 1);
        let [rdi, rdo] = rec(mid, hi, depth + 1);

        let leftV, rightV;
        if (record) {
          leftV = toVoronoi(ldo, box);
          rightV = toVoronoi(rdi, box);
        }

        // Find the lower common tangent of the two halves.
        for (;;) {
          if (leftOf(rdi.org, ldi)) ldi = lnext(ldi);
          else if (rightOf(ldi.org, rdi)) rdi = rprev(rdi);
          else break;
        }

        const cross = [];
        let basel = connect(sym(rdi), ldi);
        cross.push(basel);
        if (ldi.org === ldo.org) ldo = sym(basel);
        if (rdi.org === rdo.org) rdo = basel;

        // Zip upward, adding one cross edge (one dividing-chain segment) per step.
        const valid = (e) => rightOf(dest(e), basel);
        for (;;) {
          let lcand = sym(basel).onext;
          if (valid(lcand)) {
            while (inCircle(dest(basel), basel.org, dest(lcand), dest(lcand.onext))) {
              const t = lcand.onext;
              deleteEdge(lcand);
              lcand = t;
            }
          }
          let rcand = oprev(basel);
          if (valid(rcand)) {
            while (inCircle(dest(basel), basel.org, dest(rcand), dest(oprev(rcand)))) {
              const t = oprev(rcand);
              deleteEdge(rcand);
              rcand = t;
            }
          }
          const lv = valid(lcand), rv = valid(rcand);
          if (!lv && !rv) break;
          if (!lv || (rv && inCircle(dest(lcand), lcand.org, rcand.org, dest(rcand)))) {
            basel = connect(rcand, sym(basel));
          } else {
            basel = connect(sym(basel), sym(lcand));
          }
          cross.push(basel);
        }

        result = [ldo, rdo];

        if (record) {
          const crossSet = new Set(cross.map((e) => G.pairKey(e.org.id, dest(e).id)));
          steps.push({
            type: 'merge', depth, lo, mid, hi,
            splitX: (pts[mid - 1].x + pts[mid].x) / 2,
            left: leftV, right: rightV,
            merged: toVoronoi(ldo, box, crossSet)
          });
        }
        return result;
      }
      if (record) {
        steps.push({ type: 'base', depth, lo, mid: hi, hi, merged: toVoronoi(result[0], box) });
      }
      return result;
    }

    if (pts.length < 2) {
      return { sites: pts, vertices: [], edges: [], pairs: new Set(), delaunay: [], steps, order: pts };
    }
    const [le] = rec(0, pts.length, 0);
    const v = toVoronoi(le, box);
    return {
      sites: sites, vertices: v.vertices, edges: v.edges, pairs: v.pairs,
      delaunay: v.delaunay, steps, order: pts, box
    };
  }

  const api = { build, inCircle };
  root.DivideConquer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
