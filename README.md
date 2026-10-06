# ChessRPG

ChessRPG is a chess strategy game with cards, heroes, and dungeon bosses. The campaign runs offline; optional 1v1 PvP uses PeerJS signaling and WebRTC data channels.

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

## Local saves

Campaign progress, coins, active hero, and deck persist in browser storage.
Completed floors are stored as an ordered prefix; older three-boss saves are
migrated without discarding coins or progress. Invalid or incomplete save data
is normalized to a playable state.

Reloading preserves campaign progress, not an active battle. Battle resume is
still a deferred P1 feature. Online matches are not saved or resumed after reload.

## Start an online duel

1. Open **Online** with your selected hero and complete saved deck.
2. Join matchmaking, or create/join a private room using its five-digit code.
   Keep leading zeroes when sharing or entering a room code.
3. Choose white, black, or random. In a private room, both players must be ready
   before the match starts.

The current online flow uses PeerJS signaling; manual SDP offer/answer exchange
is no longer required. Signaling begins only when searching or creating/joining
a room, not when playing the offline campaign.

## Online board and premoves

The board faces the local player's color. Opponent selections are shown live.
During the opponent's turn, a player can queue a premove. It is checked again
when the local turn begins and is cancelled if the new position makes it illegal.

Both clients receive the same profiles and seed, then validate ordered actions
locally. A player can resign and return to the lobby after the match ends.

## Online connection limits

Matchmaking uses the browser owning PeerJS ID `cc-arena-1` as its coordinator
and message relay. Closing that browser disconnects sessions routed through it.
Private rooms use IDs of the form `cc-room-<code>` and exchange game actions
over a WebRTC data channel.

There is no authoritative game backend or protection against modified clients.
Signaling availability and NAT/firewall conditions can prevent a connection;
the project does not provide its own TURN server. Reloading or disconnecting
ends the online session. These network limits do not affect offline campaign play.

## Focused checks

| Command | Scope |
|---|---|
| `npm run check` | TypeScript |
| `npm run smoke` | Campaign battle domain and use cases |
| `npm run verify:pvp` | PvP determinism, actions, premoves, matchmaking, room codes |
| `npm run verify:campaign` | Campaign progression |
| `npm run verify:boss-skills` | Boss skill resolution |
| `npm run verify:combat-fx` | Combat effect checks |
| `npm run parity` | Chess rule parity |
| `npm run render` | UI markup |
| `npm run verify:portraits` | Portrait alignment against preview |
| `npm run verify:layout` | Viewport layouts against preview |
| `npm run verify:flow` | Offline gameplay against preview |

Keep a preview server running for preview-based checks. `verify:browser` stops
at the first failing command and does not include an online two-peer walkthrough.
Testing matchmaking and private rooms separately requires internet access.

## Documentation map

- [PRD](PRD.md): product behavior and acceptance criteria.
- [Architecture](ARCHITECTURE.md): module ownership, dependencies, and state.
- [Implementation plan](PLAN.md): completed phases, historical checks, and deferred work.
- [Online 1v1](notes/online-1v1.md): current PeerJS flow, transport, and limits.
- [Original game guide](GAMES.md): rules of `chess-rpg.html`, not the current
  campaign card economy.

Use the retained HTML prototypes to compare the original behavior and visual
style. Product changes belong in the current requirements and content/domain
modules; prototype documentation should not silently override them.

The current game name is **ChessRPG** (formerly Crown & Catalyst). The retained HTML prototypes and reference artwork keep their original names. Existing campaign/audio storage keys and online identifiers are unchanged, preserving saved progress, sound preferences, and peer compatibility.
