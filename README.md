# Chip Shot Golf

A juicy, low-poly 2D golf game with 18 unique holes — built with vanilla
HTML5 Canvas, zero dependencies.

## Run locally

The game is just static files. Any HTTP server works:

```bash
# pick one
python3 -m http.server 8080
npx serve .
php -S localhost:8080
```

Then open `http://localhost:8080` in a modern browser.

## Controls

- **Click + drag** away from ball → aim & charge power (slingshot style)
- **Release** to swing
- **1 / 2 / 3 / 4** → switch club (Driver / Iron / Wedge / Putter)
- **Esc** → return to main menu

## Features

- 18 hand-crafted holes, each with its own biome and palette
- Synthesised SFX (no external audio assets) via Web Audio API
- Slow-motion arc preview, screen shake, particle trails, confetti
- Pro Shop: club skins, ball trails, caddy companions, stat upgrades
- Earn "Birdies" currency by scoring under par
- localStorage save: best scores, unlocks, owned cosmetics

## Files

```
index.html          entry point
css/style.css       UI styling
js/storage.js       localStorage save/load
js/audio.js         synthesised SFX
js/effects.js       particles, shake, confetti
js/holes.js         18 hole definitions + biome rendering
js/physics.js       ball physics, collisions, hazards
js/render.js        world rendering wrapper
js/shop.js          Pro Shop logic & UI
js/main.js          game loop, state machine, controls
```
