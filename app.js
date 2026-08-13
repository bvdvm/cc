import { initStore, subscribeBooks, subscribePickLists, subscribeSagas, DEMO_MODE } from './store.js';
import { initRatePanel, refreshBookList, openBookForRating } from './ui-rate.js';
import { initSagasPanel, renderSagas } from './ui-sagas.js';
import { initRankingPanel, renderRanking } from './ui-ranking.js';
import { initTbrPanel, renderTBR } from './ui-tbr.js';
import { initDrawPanel, renderDraw } from './ui-draw.js';

let books = [];
let pickLists = [];
let sagas = [];

function switchTab(panelKey) {
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === `panel-${panelKey}`));
  document.querySelectorAll('.bookmark-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.panel === panelKey)));
  if (panelKey === 'ocen') refreshBookList();
}

function openBookFromElsewhere(book) {
  switchTab('ocen');
  openBookForRating(book);
}

function setupNav() {
  document.querySelectorAll('.bookmark-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.panel));
  });
}

function updateStats() {
  // "przeczytane" = książki, które skończyła choć jedna z Was
  const read = books.filter(b => Object.values(b.readStatus || {}).some(s => s === 'przeczytana')).length;
  const pending = books.filter(b => Object.values(b.readStatus || {}).some(s => s === 'tbr')).length;
  const shared = books.filter(b => b.ratings?.karolina && b.ratings?.ola);
  const sharedAvg = shared.length
    ? Math.round((shared.reduce((s, b) => s + (b.ratings.karolina.percent + b.ratings.ola.percent) / 2, 0) / shared.length) * 10) / 10
    : null;
  document.getElementById('statStrip').innerHTML = `
    <div class="stat"><b>${read}</b><span>przeczytane</span></div>
    <div class="stat"><b>${sagas.length}</b><span>sagi</span></div>
    <div class="stat"><b>${sharedAvg !== null ? sharedAvg + '%' : '—'}</b><span>wspólna średnia</span></div>
    <div class="stat"><b>${pending}</b><span>w TBR</span></div>
  `;
}

function rerenderAll() {
  updateStats();
  renderSagas(books, sagas);
  renderRanking(books);
  renderTBR(books);
  renderDraw(books, pickLists);
  refreshBookList();
}

async function main() {
  setupNav();
  initRankingPanel(openBookFromElsewhere);
  initDrawPanel();
  initSagasPanel(openBookFromElsewhere);
  initTbrPanel(openBookFromElsewhere);
  initRatePanel(() => books, () => sagas);

  const { demo } = await initStore();
  document.getElementById('demoBanner').hidden = !demo;

  subscribeBooks(list => { books = list; rerenderAll(); });
  subscribePickLists(list => { pickLists = list; renderDraw(books, pickLists); });
  subscribeSagas(list => { sagas = list; updateStats(); renderSagas(books, sagas); });
}

main();
