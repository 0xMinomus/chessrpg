# Crown & Catalyst

Crown & Catalyst is a local, single-player game combining chess, skill cards, heroes, and dungeon bosses. The app is built with Vite, TypeScript, and vanilla DOM APIs; no backend is required to play.

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

The browser checks are available with `npm run verify:browser` when `playwright-core` and a local Chromium installation are available. They cover hero portrait atlas alignment and cropping, viewport layout, and gameplay flow. The preview-based checks expect the app at `http://localhost:4173/`.

## Project layout

- `src/content/` contains hero, boss, and card data.
- `src/domain/` and `src/application/` contain game rules and use cases.
- `src/ui/` and `src/styles/` contain the screens and presentation.
- `public/assets/` contains the local game artwork.
- `chess-rpg.html` and `chess-rpg-dungeon.html` are retained prototypes for comparison.
- `ARCHITECTURE.md`, `PRD.md`, `PLAN.md`, and `GAMES.md` document the design and game rules.
