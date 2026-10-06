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

## Heroes and decks

All six heroes are selectable in the current development build. Before a duel,
choose exactly 10 distinct non-Joker cards and one Joker in the Hero deck editor.
The catalogue contains 37 cards. Each hand contains three unique cards drawn
only from the saved loadout; replacements and rerolls use the same pool.
Jokers have draw weight 0.2 compared with 1 for ordinary cards.

## Mana and EN

| Resource | Pays for | Limit |
|---|---|---:|
| Mana | Cards | 6 |
| EN | Hero skill and ultimate | 5 |

Mana starts at 0 and increases by 1 after a completed white chess move in the
campaign, or after the active player's move in PvP. Hero skill costs 2 EN and
ultimate costs 5 EN; Joker base cost is 5 mana. Hero and effect modifiers can
change the final cost shown by the UI. At most one zero-mana card can be played
per turn. The original prototype guide uses a different card economy.
