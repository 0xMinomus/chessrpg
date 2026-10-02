// Render root per layar + pesan status teks untuk teknologi bantu.
// Status selalu berupa teks (bukan hanya warna/animasi) via #live-message.

import { renderMenuPage } from './screens/menu.ts';
import type { MenuView } from './screens/menu.ts';
import { renderDungeonPage } from './screens/dungeon.ts';
import type { DungeonPageView } from './screens/dungeon.ts';
import { renderHeroesPage } from './screens/heroes.ts';
import type { HeroesPageView } from './screens/heroes.ts';
import { renderBattlePage } from './screens/battle.ts';
import type { BattlePageView } from './screens/battle.ts';
import { renderResultPage } from './screens/result.ts';
import type { ResultView } from './screens/result.ts';
import { renderCardIconDefs } from './cards/icons.ts';

export type ScreenName = 'menu' | 'dungeon' | 'heroes' | 'battle' | 'result';

export interface AppShellView {
  screen: ScreenName;
  coins: number;
  statusText: string;
  menu: MenuView | null;
  dungeon: DungeonPageView | null;
  heroes: HeroesPageView | null;
  battle: BattlePageView | null;
  result: ResultView | null;
}

function hubNav(active: ScreenName): string {
  const links: { screen: ScreenName; label: string; icon: string }[] = [
    {
      screen: 'menu',
      label: 'Beranda',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 3.7l8.5 6.8M5.5 9.2V20h13V9.2M9.5 20v-5.5h5V20"/></svg>',
    },
    {
      screen: 'dungeon',
      label: 'Dungeon',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M5.5 20V7h3V4h3v3h1V4h3v3h3v13M8.5 11h2m3 0h2m-7 4h2m3 0h2"/></svg>',
    },
    {
      screen: 'heroes',
      label: 'Hero',
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M6.5 20l1.2-6.2c.4-1.7 1.6-2.7 3.1-3.2l3.7-2.8c.6-.5.5-1.3-.1-1.7l-3.1-1.8c-.7-.4-1.5.2-1.3 1l.7 2-2.8 1.5-2.1 4.1L6.5 20Z"/><circle cx="13.7" cy="6.8" r=".65"/></svg>',
    },
  ];
  return (
    '<nav class="hub-nav" aria-label="Navigasi permainan">' +
    links
      .map(function (link) {
        const isActive = link.screen === active || (active === 'result' && link.screen === 'dungeon');
        return (
          '<button class="hub-nav-link' +
          (isActive ? ' active' : '') +
          '" type="button" data-command="nav" data-screen="' +
          link.screen +
          '"' +
          (isActive ? ' aria-current="page"' : '') +
          '>' +
          link.icon +
          '<span>' +
          link.label +
          '</span></button>'
        );
      })
      .join('') +
    '<p>Permainan berjalan lokal di perangkat ini.</p></nav>'
  );
}

function renderHubShell(view: AppShellView, content: string): string {
  return (
    '<section class="hub-shell" aria-label="Menu utama Crown &amp; Catalyst">' +
    '<header class="hub-topbar"><div class="hub-wordmark">' +
    '<span class="hub-mark" aria-hidden="true">♔</span>' +
    '<div><strong>Crown &amp; Catalyst</strong><small>Takhta taktis / mode dungeon</small></div></div>' +
    '<div class="hub-wallet"><span>Koin</span><strong>' +
    view.coins +
    '</strong></div></header>' +
    '<div class="hub-body">' +
    hubNav(view.screen) +
    '<div class="hub-content">' +
    content +
    '</div></div></section>'
  );
}

export function renderApp(root: HTMLElement, view: AppShellView): void {
  let body = '';
  if (view.screen === 'battle' && view.battle) {
    body = renderBattlePage(view.battle);
  } else if (view.screen === 'menu' && view.menu) {
    body = renderHubShell(view, renderMenuPage(view.menu));
  } else if (view.screen === 'dungeon' && view.dungeon) {
    body = renderHubShell(view, renderDungeonPage(view.dungeon));
  } else if (view.screen === 'heroes' && view.heroes) {
    body = renderHubShell(view, renderHeroesPage(view.heroes));
  } else if (view.screen === 'result' && view.result) {
    body = renderHubShell(view, renderResultPage(view.result));
  } else {
    body = renderHubShell(view, '<section class="hub-page"><p>Memuat…</p></section>');
  }
  const dataView = view.screen === 'battle' ? 'battle' : 'hub';
  root.innerHTML =
    renderCardIconDefs() +
    '<div class="cabinet" data-view="' +
    dataView +
    '">' +
    body +
    '<p class="sr-only" id="live-message" aria-live="polite">' +
    view.statusText +
    '</p></div>';
}
