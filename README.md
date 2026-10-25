# Kaputle

A daily fix-it puzzle. Every day there's a new broken thing: take it apart, find what's wrong, and fix it with the right tools.

## Play

Open `index.html` in a browser. It's a single file, with no build step and no backend.

## How it works

1. Inspect parts to find clues.
2. Pick a tool to try on the part.
3. Each try adds a square to your result:
   - 🟩 fixed it
   - 🟨 right part, wrong tool
   - ⬜ that part was fine
4. After the fix, learn how the object works and share your result.

Streaks are stored only in the player's browser. Nothing is collected.

## Roadmap

- 3D objects you can take apart, inspect, and reassemble (starting with a flashlight)
- Diagnostic tools like a multimeter and magnifier
- Several possible faults per object, so puzzles stay fresh every day
- Kids and adult difficulty modes
