// Peta campaign: sepuluh chapter, lima lantai per chapter.

import { renderChapterMapMarkers, renderFloorDetail, renderFloorList } from '../dungeon/dungeon.ts';
import type { DungeonPageView } from '../dungeon/dungeon.ts';

export function renderDungeonPage(view: DungeonPageView): string {
  return (
    '<section class="hub-page dungeon-page" aria-labelledby="hub-dungeon-title">' +
    '<div class="hub-page-heading"><div><span class="eyebrow">10 chapter / 50 lantai</span>' +
    '<h2 id="hub-dungeon-title">Peta dunia</h2>' +
    '<p>Selesaikan empat lantai, kalahkan boss di lantai kelima, lalu buka chapter berikutnya.</p></div></div>' +
    '<div class="dungeon-layout"><section class="dungeon-map-panel hub-frame" aria-label="Peta dunia dan lokasi chapter">' +
    '<div class="dungeon-map-stage"><img class="dungeon-map-image" src="/assets/broken-crescent-pixel-map.png" alt="Peta pixel-art dunia dengan pulau, kastil, pegunungan, dan jalur berwarna terang." width="1254" height="1254" />' +
    '<div class="dungeon-map-markers" role="group" aria-label="Pilih chapter pada peta">' +
    renderChapterMapMarkers(view.chapters) +
    '</div></div><div class="dungeon-map-legend"><span><i class="map-legend-mark current" aria-hidden="true"></i>Chapter terpilih</span><span><i class="map-legend-mark locked" aria-hidden="true"></i>Chapter terkunci</span><span><i class="map-legend-mark cleared" aria-hidden="true"></i>Chapter selesai</span></div></section>' +
    '<div class="dungeon-info-column"><section class="chapter-route hub-frame" aria-labelledby="chapter-route-title">' +
    '<div class="hub-section-heading"><span class="eyebrow" id="chapter-route-title">Chapter ' +
    String(view.selectedChapter.number).padStart(2, '0') +
    ' · ' +
    view.selectedChapter.name +
    '</span><strong>' +
    view.selectedChapter.clearedFloorCount +
    ' / 5 lantai selesai</strong></div>' +
    '<div class="floor-list" role="group" aria-label="Lima lantai chapter">' +
    renderFloorList(view.floors) +
    '</div></section><article class="floor-detail hub-frame" aria-label="Detail lantai">' +
    renderFloorDetail(view.detail, view.deckReady !== false) +
    '</article></div></div></section>'
  );
}
