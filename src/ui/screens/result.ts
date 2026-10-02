// Layar hasil duel: menang / kalah / remis + hadiah + progres.

export interface ResultView {
  title: string;
  heading: string;
  summary: string;
  rewardText: string | null;
  progressText: string;
  canReplay: boolean;
  continueFloorId: string | null;
  continueLabel: string | null;
  undoDisabled: boolean;
}

export function renderResultPage(view: ResultView): string {
  return (
    '<section class="hub-page" aria-labelledby="result-title"><div class="result-panel" role="status">' +
    '<span class="eyebrow">' +
    view.title +
    '</span><h2 id="result-title">' +
    view.heading +
    '</h2><p>' +
    view.summary +
    '</p>' +
    (view.rewardText ? '<p class="result-reward">' + view.rewardText + '</p>' : '') +
    '<p>' +
    view.progressText +
    '</p>' +
    '<div class="result-actions">' +
    (view.continueFloorId && view.continueLabel
      ? '<button class="hub-button primary" type="button" data-command="continue-floor" data-floor-id="' +
        view.continueFloorId +
        '">' +
        view.continueLabel +
        '</button>'
      : '') +
    '<button class="hub-button primary" type="button" data-command="replay"' +
    (view.canReplay ? '' : ' disabled') +
    '>Ulangi duel</button>' +
    '<button class="hub-button" type="button" data-command="undo"' +
    (view.undoDisabled ? ' disabled' : '') +
    '>Batalkan giliran</button>' +
    '<button class="hub-button" type="button" data-command="nav" data-screen="dungeon">Peta dungeon</button>' +
    '<button class="hub-button" type="button" data-command="nav" data-screen="menu">Menu utama</button>' +
    '</div></div></section>'
  );
}
