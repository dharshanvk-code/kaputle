# Kaputle

A daily fix-it puzzle. Every day there's a new broken thing: take it apart, find what's wrong, and fix it.

## Current stage: the 3D workbench

The first object is a realistic two-cell flashlight on a workbench. You can:

- Rotate and zoom around it
- Take it apart in a real order: unscrew the tail cap before the batteries come out, take the head off before the bulb
- Put every part back, with the same rules in reverse
- Inspect any visible part up close, with a short explanation of what it does and what to look for
- Switch it on: the bulb only lights when the circuit is complete, and the beam only forms with the head on
- Follow a guided build, step by step, with a see-through outline showing where each part goes
- Turn on workshop sounds (threads, clicks, parts seating), all generated in code

The puzzle layer (faults, diagnostic tools, scoring, daily rotation) comes next.

## Assembly guide player (`guide/`)

A general player for step-by-step 3D assembly instructions. It reads one product file
(`guide/products/bookshelf.json`): every part's shape, size, material and final position,
plus the steps in order. From that alone it builds the parts, lays out the box contents,
and animates each step, with a blue outline showing where parts go. Boards show their pre-drilled
holes, worked out from where each dowel, stud, screw and cam lock goes, so a loose board shows
where its hardware fits and which way it faces.

To add a product, write a new JSON file and open `guide/?product=<name>`.

It can also follow manuals that build upside down or on their side (`startFlipped` or `startPose`,
plus `flip` steps, which can be quarter turns), lower a sub-assembly onto a part (`lower`), fit parts
to something still on the floor (`parent`, nested as deep as needed, such as screws into a drawer side
that's fitted to its front), and turn those floor sub-assemblies over (`turn` steps).

Three products are included:

| Product | File | Parts | Steps |
|---|---|---|---|
| Flat-pack bookshelf (hand-written example) | `bookshelf.json` | 32 | 10 |
| Console table, from the IKEA LACK manual | `console.json` | 40 | 11 |
| 8-drawer dresser, from the 52-page IKEA HEMNES manual | `hemnes.json` | 497 | 95 |

### Turn a manual PDF into a guide

`tools/manual-to-guide.mjs` sends an assembly manual to Claude, which drafts the product file.
The draft is checked against what the player expects, and any problems go back to Claude to fix.

```sh
cd tools && npm install
export ANTHROPIC_API_KEY=...        # or: ant auth login
node manual-to-guide.mjs ~/Downloads/manual.pdf --name "Console table"
# writes guide/products/console-table.json, then open guide/?product=console-table
```

It prints anything Claude had to estimate (manuals rarely give measurements), so you know what to
check. `node tools/validate-product.mjs <file>` checks any product file on its own.

## Run it

It's a static site with no build step. Serve the folder with any static server and open it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk won't work, because browsers block ES modules on `file://`.

three.js is loaded from jsDelivr through an import map in `index.html`.

## Code

| File | What it does |
|---|---|
| `src/flashlight.js` | Builds the flashlight model, part by part |
| `src/parts.js` | Part names, descriptions, how each part comes off, where it rests on the bench |
| `src/textures.js` | Procedural textures: cutting mat, wood, pegboard, knurling, battery wrapper |
| `src/main.js` | Scene, camera, take-apart animations, inspecting, the light, the guided build, and the side panel |
| `src/audio.js` | Synthesised sound effects (Web Audio) |
| `guide/player.js` | The general assembly-guide player |
| `tools/manual-to-guide.mjs` | Manual PDF → product file, using the Claude API |
| `tools/validate-product.mjs` | Checks a product file |
| `tools/products/hemnes.py` | Writes the 497-part dresser guide (`guide/products/hemnes.json`) |
| `prototype/2d.html` | The first 2D emoji prototype |
