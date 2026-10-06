# Crown & Catalyst

Crown & Catalyst is a chess strategy game with cards, heroes, and dungeon bosses. The campaign runs offline; optional 1v1 PvP uses PeerJS signaling and WebRTC data channels.

## Run locally

```sh
npm ci
npm run dev
```

Create and preview a production build:

```sh
npm run build
npm run preview
```

## Checks

```sh
npm run verify
```

This runs TypeScript checks, campaign and PvP domain smoke tests, chess parity, UI render checks, a production build, and a scan of the generated files for remote network references.

The browser checks are available with `npm run verify:browser` when Playwright and Chromium are available. They cover portrait alignment, viewport layout, and offline gameplay flow. The preview-based checks expect `http://localhost:4173/`. The online mode needs internet access to the PeerJS signaling service; its architecture and limits are documented in [Duel online 1v1](notes/online-1v1.md).

## Project layout

- `src/content/` contains hero, boss, and card data.
- `src/domain/` and `src/application/` contain game rules and use cases.
- `src/ui/` and `src/styles/` contain the screens and presentation.
- `public/assets/` contains the local game artwork.
- `chess-rpg.html` and `chess-rpg-dungeon.html` are retained prototypes for comparison.
- `ARCHITECTURE.md`, `PRD.md`, `PLAN.md`, `GAMES.md`, and `notes/` document design, game rules, and implementation notes.

## Campaign progression

The campaign contains 10 chapters with five floors each. Floors 1–4 are standard
battles; floor 5 has the chapter boss and its unique skill. Clear floors in order.
Defeating a chapter boss unlocks the next chapter. The world map places the ten
chapter markers across six land regions.
