# Voronoi Diagram Construction: Sweep-Line vs. Divide-and-Conquer

An interactive comparison of two classical Voronoi diagram algorithms, Fortune's sweep-line and
divide-and-conquer, with step-by-step visualization of each. Runs entirely in the browser; no build
step and no dependencies.

**Live demo:** https://slmn7799.github.io/voronoi-comparison/

## The algorithms

### Fortune's sweep-line (`js/fortune.js`)
A horizontal sweep line moves down the plane. The *beach line* — the lower envelope of parabolas
whose foci are the sites already passed — is kept in a **red-black tree** of arcs (threaded with
prev/next links). Events are processed in order of y:

- **Site event:** the new site's arc splits the arc above it; two breakpoints begin tracing a new edge.
- **Circle event:** an arc shrinks to a point; its breakpoints meet at a Voronoi vertex.

Circle events live in a binary min-heap with lazy deletion (false alarms are flagged, not removed).
Edges still on the beach line at the end are extended to the bounding box.
O(n log n) time, O(n) space.

### Divide-and-conquer (`js/dc.js`)
Sites are sorted by x and split at the median; each half is solved recursively and the two
diagrams are merged along the **dividing chain**. Implemented after Guibas & Stolfi (1985), which
stores the dual (Delaunay triangulation) in a quad-edge structure: each cross edge added during a
merge is dual to one segment of the Voronoi dividing chain, so the diagram — and the chain at
every merge — is read directly off the result. O(n log n) time.

## Correctness testing

`node tests/run_tests.js` (or the *Correctness tests* tab on the page) checks every case for:

1. **Agreement** — both algorithms report the same set of neighbouring sites.
2. **Brute force** — for n ≤ 40, an independent O(n³) test: sites i, j are neighbours iff some circle
   through both has every other site strictly outside it. This is exact even for degenerate input.
3. **Vertices** — every Voronoi vertex is equidistant from its three nearest sites.
4. **Edges** — every edge's midpoint is equidistant from its two sites with no site closer.

Cases include random sets (n = 5…2000), collinear points (horizontal, vertical, diagonal), points
sharing the top y-coordinate, duplicates, a co-circular square, and integer lattices with many
co-circular quadruples. A separate stress run of 1,300 random and degenerate sets also passed.

## Visualization

- **Sweep-line tab:** drag or play the sweep line continuously; shows the beach line, breakpoints
  tracing edges, pending circle events (dashed), the latest event, and vertices found so far.
- **Divide & conquer tab:** steps through every base case and merge; before each merge the left and
  right sub-diagrams are shown in different colours, after it the dividing chain is highlighted.
  Optional Delaunay-dual overlay.
- **Side by side:** final diagrams from both algorithms, with edge/vertex counts and an agreement check.
- Click any canvas to add points; seedable random point sets.

## Running locally

Open `index.html` in a browser (no server needed). Tests: `node tests/run_tests.js` (Node 16+).

## References

- de Berg, M., Cheong, O., van Kreveld, M., & Overmars, M. (2008). *Computational Geometry: Algorithms and Applications* (3rd ed.). Springer.
- Fortune, S. (1987). A sweepline algorithm for Voronoi diagrams. *Algorithmica*, 2(1), 153–174.
- Guibas, L., & Stolfi, J. (1985). Primitives for the manipulation of general subdivisions and the computation of Voronoi diagrams. *ACM Transactions on Graphics*, 4(2), 74–123.
- Preparata, F. P., & Shamos, M. I. (1985). *Computational Geometry: An Introduction*. Springer.
