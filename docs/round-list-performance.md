# Round list performance contract

This optimization preserves the current UI, CSS keyframes, overscan (one viewport
above and below), scale curve, and native document scrolling. It does not
change avatar resolution, row spacing, hit targets, ordering or features.

The horizontal spread (`scaleX` 1..1.02) was removed later to keep centered rows
at 1:1 so small watch text is not re-rasterized and blurred by the scale
animation. The vertical scale curve (0.66..1) is unchanged.

A matching opacity fade (`1 - distance²`) was added so rows near the circular
screen's upper/lower arcs fade to transparent, softening the hard cut. Centered
rows stay fully opaque; the fade only affects the extreme edges.

## Two execution paths

- Native `animation-timeline: view()` support: CSS exclusively owns the animation.
  The controller installs no scroll/resize listeners, observers or RAF callbacks.
  `refresh()` is a no-op. The existing keyframes are regression-tested verbatim.
- JavaScript fallback: passive scroll input coalesces into one RAF. A cached,
  ordered list of document-space centers permits binary search into the overscan
  window. Each frame updates that range and releases the previous range. No
  per-frame arrays/sets, row geometry reads or CSSOM reads are needed. Transform
  values are cached in JS and only changed output is written.

Geometry is invalidated by membership/order changes, list resize, viewport resize,
font loading, and view transitions. Updating a preview/unread count without a
layout change does not invalidate it. Desktop, hidden documents and other screens
have no fallback scroll listener. Destroy disconnects observers, removes listeners,
cancels scheduled RAF and restores inline transforms.

The now-unused circle-fit solver was removed. It was not used by the current
animation; retaining its geometry tests would misleadingly validate an old effect.
The actual fallback curve is tested against the previous formula at 12,001 sampled
positions, including positions outside the viewport.

## Reproduce

```sh
npm run test
npm run bench:round-list
```

The benchmark counts operations in an instrumented DOM fixture. It excludes setup
and teardown. These are deterministic workload counts, **not browser timings, GPU
measurements, or Watch7 FPS**. The comparison was captured against the implementation
immediately before this change.

| Workload | Before | After |
| --- | ---: | ---: |
| Native path: RAF callbacks for 3,000 scroll steps | 3,000 | 0 |
| Native path: installed geometry/state observers | 3 | 0 |
| Fallback: CSSOM reads for 3,000 scroll steps | 44,139 | 0 |
| Fallback: style writes for 3,000 scroll steps | 18,188 | 17,307 |
| Unchanged previews: row rect reads for 1,000 refreshes, 1,000 rows | 1,000,000 | 0 |
| Same refresh workload: width/height reads | 2,000,000 | 0 |
| Same refresh workload: RAF callbacks | 1,000 | 0 |

The 1,000-row and 10,000-row fallback scroll workloads produce identical operation
counts after setup. This validates that steady scrolling depends on the viewport
range rather than total list size. Setup/structural changes remain O(N); search is
O(log N), and a scroll frame is O(visible + overscan + previous visible).

## Real-device validation still required

Record a browser performance trace on Watch7 for slow drag, fast fling, direction
reversal, new-message reordering, category switches, returning from a conversation,
and browser background/foreground. Inspect dropped frames, main-thread long tasks,
layout, paint and GPU memory. Do not claim a fixed FPS or a globally optimal
implementation from the synthetic benchmark. Native CSS still has browser/GPU
cost, even when this module performs no JS work.

References: [Chrome scroll-driven animations](https://developer.chrome.com/docs/css-ui/scroll-driven-animations),
[web.dev layout guidance](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing).
