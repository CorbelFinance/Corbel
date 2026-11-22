# Chain Field

A fixed canvas behind the landing. Blocks on the page are links of a chain; thin lines run along their frames and through the gaps between them. The pointer lights traces that run, branch and hop from block to block.

## How it is built

- `packages/ui/src/chain-field/`
  - `lattice.ts`: pure `buildLattice(nodes, obstacles, view)`. X and Y lines come from block borders, gap midlines and a "bus" 28 px above each row; an edge is dropped if it crosses a block interior, text or a mask, is shorter than 24 px, or is further than 140 px from any block. `shortestPath` is Dijkstra on a binary heap.
  - `sim.ts`: seeded runners (spawn near the pointer, go straight 62%, branch 18%, depth ≤ 2), hops (block → nearest neighbour, corner pulse and frame light on arrival), ambient packets (every 12th red, dies at the next crossing), hex labels.
  - `draw.ts`: static lattice (alpha 0.05, up to 0.20 near the pointer), lit frames, tails with a head-to-tail gradient plus a `lighter` glow pass, corner pulses, packets, labels. 1 px lines on half pixels.
  - `ChainField.tsx`: mounts the canvas (`fixed`, `z-index: -1`, `aria-hidden`, `pointer-events: none`), measures the DOM, runs the loop.
  - `config.ts`: every number. Tune here.
- Mounted once in `apps/web/app/(site)/layout.tsx` (not in `/app`). `body` has `isolation: isolate` so the canvas paints above the page colour and below content.

## What is a node, what is a mask

- `data-chain-node`: layer cards, FAQ cards, Gap Fund tiles and the fund-size card, "not covered" cards, Open data rows, Journey and layer-page step cards, Roadmap phases, the comparison table, Token rows and card, layer-page cards and "Other layers" links, the footer panel. `<Reveal chain>` sets it on reveal blocks.
- `data-chain-mask` (no lattice inside): hero, fact marquee, week strip, ST/01 story, One balance mock-up, Gap Fund burst, closing input, layer-page illustration, footer disc and ASCII terrain.
- Text: every visible text run is an obstacle (12 px around it outside blocks, 3 px inside blocks), measured with `Range.getClientRects`.

## Modes

- Pointer: everything above.
- Touch or < 768 px: up to 3 packets, one runner every 2.5 s at a visible block, a tap spawns one runner, 30 fps.
- `prefers-reduced-motion`: static lattice only, no animation frames.
- Hidden tab: paused. Slow frames (> 22 ms for 1 s): half the runners, no glow; > 33 ms: static only; back up after 5 s under 14 ms.
- Starts 3.8 s after navigation (after the intro) on an idle callback, so it never competes with page load.

## Switches

- `?chain=off`: not mounted at all.
- `?chain=debug&seed=N`: `window.__chainDebug.{segments, edges, counts}` and `window.__chainStats`.
- `NEXT_PUBLIC_CHAIN_FIELD=0` at build time: off.

## How it is built

The field is a lattice derived from the real blocks on the page, drawn on canvas: a thin grid, green corner squares, lines that light up near the pointer.

## Corbel Devkit

Team tool in `apps/web/components/devkit/DevKit.tsx`. A round button with the Corbel mark, bottom left; `Alt+D` toggles it.
Shown in development; in production only after `?devkit=1` (remembered; `?devkit=0` forgets). Visitors never see it. All changes are local to the browser.

- Page: jump to any landing section, replay the intro, viewport size, breakpoint and fps.
- Motion: disable or pause every animation.
- Chain field: on / off / debug, outline nodes (green) and masks (red).
- Layout: 12-column overlay, outline sections.
- Content: highlight unverified and target facts (`data-fact` on `<Fact>`), fact counts, layer statuses.
- Accent preview: try another green locally; tokens are not changed.

To add a tool: add a field to `Toggles`, a `<Row>` in the panel, and a `html.dk-*` rule in `globals.css`.
