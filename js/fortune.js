/*
 * fortune.js — Fortune's sweep-line algorithm (Fortune, 1987).
 *
 * A horizontal sweep line moves down the plane (increasing y on screen).
 * Above it, the "beach line" is the lower envelope of parabolas, one per arc,
 * each with a site as focus and the sweep line as directrix. Breakpoints
 * between neighbouring arcs trace out the Voronoi edges.
 *
 *   - Site event:   the sweep line reaches a new site; a new arc splits the
 *                   arc above it and two breakpoints start tracing an edge.
 *   - Circle event: an arc shrinks to a point; its two breakpoints meet at a
 *                   Voronoi vertex and a new edge starts there.
 *
 * Data structures
 *   - Beach line: red-black tree of arcs ordered left→right, threaded with
 *     prev/next pointers, so locating the arc above a site is O(log n).
 *   - Event queue: sites pre-sorted by y, plus a binary min-heap of circle
 *     events with lazy deletion (false alarms are flagged, not removed).
 *
 * Running time: O(n log n).
 */
(function (root) {
  'use strict';

  const G = root.Geometry || (typeof require !== 'undefined' ? require('./geometry.js') : null);
  const EPS = 1e-9;

  /* ---------------- red-black tree with in-order threading ---------------- */

  class RBTree {
    constructor() { this.root = null; }

    insertSuccessor(node, successor) {
      let parent;
      if (node) {
        successor.prev = node;
        successor.next = node.next;
        if (node.next) node.next.prev = successor;
        node.next = successor;
        if (node.right) {
          node = node.right;
          while (node.left) node = node.left;
          node.left = successor;
        } else {
          node.right = successor;
        }
        parent = node;
      } else if (this.root) {
        node = this.first(this.root);
        successor.prev = null;
        successor.next = node;
        node.prev = successor;
        node.left = successor;
        parent = node;
      } else {
        successor.prev = successor.next = null;
        this.root = successor;
        parent = null;
      }
      successor.left = successor.right = null;
      successor.parent = parent;
      successor.red = true;

      let grandpa, uncle;
      node = successor;
      while (parent && parent.red) {
        grandpa = parent.parent;
        if (parent === grandpa.left) {
          uncle = grandpa.right;
          if (uncle && uncle.red) {
            parent.red = uncle.red = false;
            grandpa.red = true;
            node = grandpa;
          } else {
            if (node === parent.right) {
              this.rotateLeft(parent);
              node = parent;
              parent = node.parent;
            }
            parent.red = false;
            grandpa.red = true;
            this.rotateRight(grandpa);
          }
        } else {
          uncle = grandpa.left;
          if (uncle && uncle.red) {
            parent.red = uncle.red = false;
            grandpa.red = true;
            node = grandpa;
          } else {
            if (node === parent.left) {
              this.rotateRight(parent);
              node = parent;
              parent = node.parent;
            }
            parent.red = false;
            grandpa.red = true;
            this.rotateLeft(grandpa);
          }
        }
        parent = node.parent;
      }
      this.root.red = false;
    }

    removeNode(node) {
      if (node.next) node.next.prev = node.prev;
      if (node.prev) node.prev.next = node.next;
      node.next = node.prev = null;

      let parent = node.parent;
      const left = node.left, right = node.right;
      let next;
      if (!left) next = right;
      else if (!right) next = left;
      else next = this.first(right);

      if (parent) {
        if (parent.left === node) parent.left = next;
        else parent.right = next;
      } else {
        this.root = next;
      }

      let isRed;
      if (left && right) {
        isRed = next.red;
        next.red = node.red;
        next.left = left;
        left.parent = next;
        if (next !== right) {
          parent = next.parent;
          next.parent = node.parent;
          node = next.right;
          parent.left = node;
          next.right = right;
          right.parent = next;
        } else {
          next.parent = parent;
          parent = next;
          node = next.right;
        }
      } else {
        isRed = node.red;
        node = next;
      }
      if (node) node.parent = parent;
      if (isRed) return;
      if (node && node.red) { node.red = false; return; }

      let sibling;
      do {
        if (node === this.root) break;
        if (node === parent.left) {
          sibling = parent.right;
          if (sibling.red) {
            sibling.red = false;
            parent.red = true;
            this.rotateLeft(parent);
            sibling = parent.right;
          }
          if ((sibling.left && sibling.left.red) || (sibling.right && sibling.right.red)) {
            if (!sibling.right || !sibling.right.red) {
              sibling.left.red = false;
              sibling.red = true;
              this.rotateRight(sibling);
              sibling = parent.right;
            }
            sibling.red = parent.red;
            parent.red = sibling.right.red = false;
            this.rotateLeft(parent);
            node = this.root;
            break;
          }
        } else {
          sibling = parent.left;
          if (sibling.red) {
            sibling.red = false;
            parent.red = true;
            this.rotateRight(parent);
            sibling = parent.left;
          }
          if ((sibling.left && sibling.left.red) || (sibling.right && sibling.right.red)) {
            if (!sibling.left || !sibling.left.red) {
              sibling.right.red = false;
              sibling.red = true;
              this.rotateLeft(sibling);
              sibling = parent.left;
            }
            sibling.red = parent.red;
            parent.red = sibling.left.red = false;
            this.rotateRight(parent);
            node = this.root;
            break;
          }
        }
        sibling.red = true;
        node = parent;
        parent = parent.parent;
      } while (!node.red);
      if (node) node.red = false;
    }

    rotateLeft(node) {
      const p = node, q = node.right, parent = p.parent;
      if (parent) { if (parent.left === p) parent.left = q; else parent.right = q; }
      else this.root = q;
      q.parent = parent; p.parent = q;
      p.right = q.left;
      if (p.right) p.right.parent = p;
      q.left = p;
    }

    rotateRight(node) {
      const p = node, q = node.left, parent = p.parent;
      if (parent) { if (parent.left === p) parent.left = q; else parent.right = q; }
      else this.root = q;
      q.parent = parent; p.parent = q;
      p.left = q.right;
      if (p.left) p.left.parent = p;
      q.right = p;
    }

    first(node) { while (node.left) node = node.left; return node; }
  }

  /* ---------------- binary min-heap for circle events ---------------- */

  class MinHeap {
    constructor(less) { this.a = []; this.less = less; }
    get size() { return this.a.length; }
    peek() { return this.a[0]; }
    push(x) {
      const a = this.a; a.push(x);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]]; i = p;
      }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && this.less(a[l], a[m])) m = l;
          if (r < a.length && this.less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
      }
      return top;
    }
  }

  const eventBefore = (p, q) => p.y < q.y || (p.y === q.y && p.x < q.x);

  /* ---------------- the sweep ---------------- */

  function build(sites, opts) {
    opts = opts || {};
    const record = !!opts.record;
    const box = opts.box || G.boundingBox(sites);
    const queue = sites.slice().sort((p, q) => q.y - p.y || q.x - p.x); // pop() gives the next site
    const beach = new RBTree();
    const circles = new MinHeap(eventBefore);
    const edges = [];
    const vertices = [];
    const steps = [];

    /* ---- edges ---- */

    let nextEdgeId = 0;
    function createEdge(lSite, rSite, va, vb) {
      const edge = { id: nextEdgeId++, lSite, rSite, va: null, vb: null };
      edges.push(edge);
      if (va) setEdgeStart(edge, lSite, rSite, va);
      if (vb) setEdgeStart(edge, rSite, lSite, vb);
      return edge;
    }

    function setEdgeStart(edge, lSite, rSite, vertex) {
      if (!edge.va && !edge.vb) {
        edge.va = vertex; edge.lSite = lSite; edge.rSite = rSite;
      } else if (edge.lSite === rSite) {
        edge.vb = vertex;
      } else {
        edge.va = vertex;
      }
    }

    /* ---- breakpoints: where neighbouring parabolas meet, for directrix y = d ---- */

    function leftBreakPoint(arc, d) {
      let site = arc.site;
      const rfocx = site.x, rfocy = site.y, pby2 = rfocy - d;
      if (!pby2) return rfocx;
      const lArc = arc.prev;
      if (!lArc) return -Infinity;
      site = lArc.site;
      const lfocx = site.x, lfocy = site.y, plby2 = lfocy - d;
      if (!plby2) return lfocx;
      const hl = lfocx - rfocx;
      const aby2 = 1 / pby2 - 1 / plby2;
      const b = hl / plby2;
      if (aby2) {
        return (-b + Math.sqrt(b * b - 2 * aby2 *
          (hl * hl / (-2 * plby2) - lfocy + plby2 / 2 + rfocy - pby2 / 2))) / aby2 + rfocx;
      }
      return (rfocx + lfocx) / 2;
    }

    function rightBreakPoint(arc, d) {
      if (arc.next) return leftBreakPoint(arc.next, d);
      return arc.site.y === d ? arc.site.x : Infinity;
    }

    /* ---- circle events ---- */

    function attachCircle(arc) {
      const lArc = arc.prev, rArc = arc.next;
      if (!lArc || !rArc) return;
      const a = lArc.site, b = arc.site, c = rArc.site;
      if (a === c) return;
      const bx = b.x, by = b.y;
      const ax = a.x - bx, ay = a.y - by, cx = c.x - bx, cy = c.y - by;
      // The breakpoints only converge if a, b, c turn clockwise on screen.
      const d = 2 * (ax * cy - ay * cx);
      if (d >= -2e-12) return;
      const ha = ax * ax + ay * ay, hc = cx * cx + cy * cy;
      const x = (cy * ha - ay * hc) / d, y = (ax * hc - cx * ha) / d;
      const ycenter = y + by;
      const ev = {
        arc, x: x + bx, y: ycenter + Math.sqrt(x * x + y * y),
        ycenter, cx: x + bx, valid: true, sites: [a, b, c]
      };
      arc.circleEvent = ev;
      circles.push(ev);
    }

    function detachCircle(arc) {
      if (arc.circleEvent) {
        arc.circleEvent.valid = false;   // lazy delete: skipped when popped
        arc.circleEvent = null;
      }
    }

    function detachArc(arc) {
      detachCircle(arc);
      beach.removeNode(arc);
    }

    /* ---- site event ---- */

    function addArc(site) {
      const x = site.x, d = site.y;
      let lArc, rArc, node = beach.root;
      while (node) {
        const dxl = leftBreakPoint(node, d) - x;
        if (dxl > EPS) {
          node = node.left;
        } else {
          const dxr = x - rightBreakPoint(node, d);
          if (dxr > EPS) {
            if (!node.right) { lArc = node; break; }
            node = node.right;
          } else {
            if (dxl > -EPS) { lArc = node.prev; rArc = node; }
            else if (dxr > -EPS) { lArc = node; rArc = node.next; }
            else { lArc = rArc = node; }
            break;
          }
        }
      }

      const newArc = { site, circleEvent: null, edge: null };
      beach.insertSuccessor(lArc, newArc);

      if (!lArc && !rArc) return;

      if (lArc === rArc) {
        // Typical case: the new arc splits an existing arc in two.
        detachCircle(lArc);
        rArc = { site: lArc.site, circleEvent: null, edge: null };
        beach.insertSuccessor(newArc, rArc);
        newArc.edge = rArc.edge = createEdge(lArc.site, newArc.site);
        attachCircle(lArc);
        attachCircle(rArc);
        return;
      }

      if (lArc && !rArc) {
        // New site is level with the right-most arc (only at the very top).
        // Their bisector is vertical and unbounded upward, so give it a far end above the box.
        const top = { x: (lArc.site.x + x) / 2, y: box.yt - G.farDistance(box) };
        newArc.edge = createEdge(lArc.site, newArc.site, undefined, top);
        return;
      }

      // Degenerate: the site falls exactly on a breakpoint.
      detachCircle(lArc);
      detachCircle(rArc);
      const lSite = lArc.site, rSite = rArc.site;
      const v = G.circumcenter(lSite, site, rSite) || { x: x, y: d };
      vertices.push(v);
      setEdgeStart(rArc.edge, lSite, rSite, v);
      newArc.edge = createEdge(lSite, site, undefined, v);
      rArc.edge = createEdge(site, rSite, undefined, v);
      attachCircle(lArc);
      attachCircle(rArc);
    }

    /* ---- circle event ---- */

    function removeArc(arc) {
      const circle = arc.circleEvent;
      const x = circle.x, y = circle.ycenter;
      const vertex = { x, y };
      vertices.push(vertex);
      let previous = arc.prev, next = arc.next;
      const disappearing = [arc];
      detachArc(arc);

      // Gather every arc that vanishes at this same point (co-circular sites).
      let lArc = previous;
      while (lArc.circleEvent && Math.abs(x - lArc.circleEvent.x) < EPS &&
             Math.abs(y - lArc.circleEvent.ycenter) < EPS) {
        previous = lArc.prev;
        disappearing.unshift(lArc);
        detachArc(lArc);
        lArc = previous;
      }
      disappearing.unshift(lArc);
      detachCircle(lArc);

      let rArc = next;
      while (rArc.circleEvent && Math.abs(x - rArc.circleEvent.x) < EPS &&
             Math.abs(y - rArc.circleEvent.ycenter) < EPS) {
        next = rArc.next;
        disappearing.push(rArc);
        detachArc(rArc);
        rArc = next;
      }
      disappearing.push(rArc);
      detachCircle(rArc);

      const n = disappearing.length;
      for (let i = 1; i < n; i++) {
        setEdgeStart(disappearing[i].edge, disappearing[i - 1].site, disappearing[i].site, vertex);
      }
      lArc = disappearing[0];
      rArc = disappearing[n - 1];
      rArc.edge = createEdge(lArc.site, rArc.site, undefined, vertex);
      attachCircle(lArc);
      attachCircle(rArc);
    }

    /* ---- snapshot of the sweep state, for the visualizer ---- */

    function snapshot(type, point, extra) {
      const arcs = [];
      for (let a = beach.root ? beach.first(beach.root) : null; a; a = a.next) {
        arcs.push({ site: a.site, edge: a.edge ? a.edge.id : -1 });
      }
      const pending = circles.a.filter((c) => c.valid)
        .map((c) => ({ x: c.cx, y: c.ycenter, bottom: c.y, r: c.y - c.ycenter }));
      steps.push({
        type, point, y: point.y, arcs,
        edges: edges.map((e) => ({
          id: e.id, va: e.va, vb: e.vb, l: e.lSite.id, r: e.rSite.id
        })),
        vertices: vertices.slice(),
        pending,
        extra: extra || null
      });
    }

    /* ---- main loop ---- */

    let site = queue.pop();
    for (;;) {
      while (circles.size && !circles.peek().valid) circles.pop();
      const circle = circles.size ? circles.peek() : null;
      if (site && (!circle || eventBefore(site, circle))) {
        addArc(site);
        if (record) snapshot('site', site);
        site = queue.pop();
      } else if (circle) {
        circles.pop();
        const info = { x: circle.cx, y: circle.ycenter, r: circle.y - circle.ycenter };
        removeArc(circle.arc);
        if (record) snapshot('circle', { x: circle.x, y: circle.y }, info);
      } else {
        break;
      }
    }

    /* ---- finish: extend the edges still on the beach line to infinity ---- */
    // Move the directrix far below the box; every breakpoint left on the beach line
    // then lies outside the box on its own (correctly oriented) ray.
    const far = G.farDistance(box);
    const dFinal = box.yb + far;
    for (let a = beach.root ? beach.first(beach.root) : null; a; a = a.next) {
      if (!a.prev) continue;
      const bx = leftBreakPoint(a, dFinal);
      const f = a.site.y !== dFinal ? a.site : a.prev.site;
      const by = ((bx - f.x) * (bx - f.x) + f.y * f.y - dFinal * dFinal) / (2 * (f.y - dFinal));
      const p = { x: bx, y: by };
      setEdgeStart(a.edge, a.prev.site, a.site, p);
    }

    const outEdges = [];
    const pairs = new Set();
    for (const e of edges) {
      if (!e.va || !e.vb) continue;
      if (G.dist2(e.va, e.vb) < 1e-18) continue;
      pairs.add(G.pairKey(e.lSite.id, e.rSite.id));
      const c = G.clipSegment(e.va, e.vb, box);
      if (c) outEdges.push({ s1: e.lSite.id, s2: e.rSite.id, a: c[0], b: c[1] });
    }

    return { sites, vertices, edges: outEdges, pairs, steps, box };
  }

  const api = { build, RBTree, MinHeap };
  root.Fortune = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
