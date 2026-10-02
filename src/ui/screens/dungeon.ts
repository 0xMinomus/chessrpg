// Layar peta dungeon: komposisi komponen daftar + detail boss.

import { renderBossDetail, renderBossList, renderBossMapMarkers } from '../dungeon/dungeon.ts';
import type { BossDetailView, BossListItem } from '../dungeon/dungeon.ts';

export interface DungeonPageView {
  items: BossListItem[];
  detail: BossDetailView;
}

export function renderDungeonPage(view: DungeonPageView): string {
  return (
    '<section class="hub-page dungeon-page" aria-labelledby="hub-dungeon-title">' +
    '<div class="hub-page-heading"><div><span class="eyebrow">Tiga penjaga / satu menara</span>' +
    '<h2 id="hub-dungeon-title">Peta dungeon</h2>' +
    '<p>Pelajari keunikan boss sebelum masuk ke papan.</p></div></div>' +
    '<div class="dungeon-layout"><section class="dungeon-map-panel hub-frame" aria-label="Peta dunia dan lokasi boss">' +
    '<div class="dungeon-map-stage"><img class="dungeon-map-image" src="/assets/broken-crescent-pixel-map.png" alt="Peta pixel-art dunia dengan pulau, kastil, pegunungan, dan jalur berwarna terang." width="1254" height="1254" />' +
    '<div class="dungeon-map-markers" role="group" aria-label="Pilih lokasi boss pada peta">' +
    renderBossMapMarkers(view.items) +
    '</div></div><div class="dungeon-map-legend"><span><i class="map-legend-mark current" aria-hidden="true"></i>Boss terpilih</span><span><i class="map-legend-mark locked" aria-hidden="true"></i>Lantai terkunci</span></div></section>' +
    '<div class="dungeon-info-column"><section class="boss-route hub-frame" aria-labelledby="boss-route-title">' +
    '<div class="hub-section-heading"><span class="eyebrow" id="boss-route-title">Pilih lantai dungeon</span></div>' +
    '<div class="boss-list" role="group" aria-label="Lantai dungeon">' +
    renderBossList(view.items) +
    '</div></section><article class="boss-detail hub-frame" aria-label="Detail boss">' +
    renderBossDetail(view.detail) +
    '</article></div></div></section>'
  );
}
