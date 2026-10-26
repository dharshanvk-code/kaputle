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
| `prototype/2d.html` | The first 2D emoji prototype |
