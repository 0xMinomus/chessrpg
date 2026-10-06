# ChessRPG

ChessRPG is a chess RPG with an offline single-player dungeon campaign and an optional direct 1v1 PvP mode. PvP uses WebRTC between two browsers; the app has no accounts or game backend.

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

This runs TypeScript checks, domain smoke tests, chess parity tests, UI render checks, a production build, and a scan of the generated files for remote network references.

Browser checks require `playwright-core` and a local Chromium installation. `npm run verify:browser` covers portraits, responsive layouts, campaign gameplay, and a two-browser PvP duel; `npm run verify:pvp-browser` runs only the PvP walkthrough against a local preview.

The optional PvP mode connects two browser tabs/devices directly with WebRTC.
Both players choose a hero and an 11-card deck, then exchange the generated
offer and answer by copy/paste. It uses a public STUN server for connectivity;
it does not provide matchmaking, accounts, a game server, or a TURN relay.
Restrictive NATs and firewalls may prevent a direct connection. A completed
duel is driven by the white peer and mirrored to black over a data channel.

Run the standalone PvP walkthrough with a preview server:

```sh
npm run preview
# In a second terminal:
npm run verify:pvp-browser
```

Preview checks default to `http://localhost:4173/`; set `APP_URL` to use another local preview URL.

## Project layout

- `src/content/` contains hero, boss, and card data.
- `src/domain/` and `src/application/` contain game rules and use cases.
- `src/ui/` and `src/styles/` contain the screens and presentation.
- `public/assets/` contains the local game artwork.
- `chess-rpg.html` and `chess-rpg-dungeon.html` are retained prototypes for comparison.
- `ARCHITECTURE.md`, `PRD.md`, `PLAN.md`, and `GAMES.md` document the design and game rules.

The current game name is **ChessRPG** (formerly Crown & Catalyst). The retained HTML prototypes and reference artwork keep their original names. Existing campaign/audio storage keys and the WebRTC channel name are unchanged, preserving saved progress, sound preferences, and peer compatibility.
