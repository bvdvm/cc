import { ALL_GENRES } from './criteria-data.js';
import { starsToString } from './rating.js';
import { USERS } from './config.js';

let currentView = 'wspolny';
let currentGenre = '';
let latestBooks = [];
let onOpenBook = () => {};

export function initRankingPanel(openBookCallback) {
  onOpenBook = openBookCallback || (() => {});
  const genreSelect = document.getElementById('rankingGenreFilter');
  ALL_GENRES.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g; opt.textContent = g;
    genreSelect.appendChild(opt);
  });
  genreSelect.addEventListener('change', () => { currentGenre = genreSelect.value; render(); });

  document.querySelectorAll('#rankingUserTabs .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentView = chip.dataset.user;
      document.querySelectorAll('#rankingUserTabs .chip').forEach(c => c.classList.toggle('active', c === chip));
      render();
    });
  });
}

export function renderRanking(books) {
  latestBooks = books;
  render();
}

function render() {
  const list = document.getElementById('rankingList');
  let rows;

  if (currentView === 'wspolny') {
    rows = latestBooks
      .filter(b => b.ratings?.karolina && b.ratings?.ola)
      .map(b => ({ book: b, percent: Math.round(((b.ratings.karolina.percent + b.ratings.ola.percent) / 2) * 10) / 10, stars: null }));
  } else {
    rows = latestBooks
      .filter(b => b.ratings?.[currentView])
      .map(b => ({ book: b, percent: b.ratings[currentView].percent, stars: b.ratings[currentView].stars }));
  }

  if (currentGenre) rows = rows.filter(r => (r.book.genres || []).includes(currentGenre));
  rows.sort((a, b) => b.percent - a.percent);

  if (rows.length === 0) {
    list.innerHTML = '<p class="empty-note" style="text-align:center;">Brak ocenionych książek w tej kategorii jeszcze.</p>';
    return;
  }

  list.innerHTML = '';
  rows.forEach((r, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'ranking-row';
    row.innerHTML = `
      <div class="rank-num">${i + 1}</div>
      <img src="${r.book.coverUrl || ''}" alt="" onerror="this.style.visibility='hidden'" />
      <div>
        <div class="rr-title">${escapeHtml(r.book.title)}</div>
        <div class="rr-author">${escapeHtml(r.book.author)}</div>
      </div>
      <div class="rr-right">
        <span class="percent">${r.percent}%</span>
        ${r.stars !== null ? `<span class="stars">${starsToString(r.stars)}</span>` : ''}
      </div>
    `;
    row.addEventListener('click', () => onOpenBook(r.book));
    list.appendChild(row);
  });
}

function escapeHtml(s = '') { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
