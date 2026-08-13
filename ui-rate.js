import { searchBooks } from './books-api.js';
import { ALL_GENRES, FORMATS } from './criteria-data.js';
import { criteriaForGenres, calcRating, starsToString } from './rating.js';
import { USERS, READ_STATUSES } from './config.js';
import { addBook, updateBook, addSaga } from './store.js';

let getBooks = () => [];
let getSagas = () => [];
let draft = null;        // książka w trakcie edycji
let draftScores = {};    // { karolina: {critId: pts}, ola: {critId: pts} }
let activeUser = USERS[0].id;
let bookListFilter = '';

const STATUS_ICON = { przeczytana: '✓', 'w trakcie': '…', tbr: '○' };

function blankDraft() {
  return {
    id: null, title: '', author: '', coverUrl: '', sourceId: '', isbn: '',
    genres: [], format: null, saga: null, addedBy: USERS[0].id,
    readStatus: { [USERS[0].id]: 'tbr', [USERS[1].id]: 'tbr' },
    wantToRead: {}, ratings: { [USERS[0].id]: null, [USERS[1].id]: null },
  };
}

export function initRatePanel(booksGetter, sagasGetter) {
  getBooks = booksGetter;
  getSagas = sagasGetter;
  const searchInput = document.getElementById('bookSearch');
  const resultsBox = document.getElementById('searchResults');
  const manualBtn = document.getElementById('manualAddBtn');

  let debounceTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = searchInput.value.trim();
    if (!q) { resultsBox.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      resultsBox.innerHTML = '<p class="empty-note">Szukam…</p>';
      try {
        const results = await searchBooks(q);
        renderSearchResults(results, resultsBox);
      } catch (err) {
        console.error('Wyszukiwanie książek nie powiodło się:', err);
        resultsBox.innerHTML = '<p class="empty-note">Nie udało się połączyć z wyszukiwarką książek. Możesz dodać książkę ręcznie.<br><span style="opacity:.7;">Szczegóły błędu: konsola przeglądarki (F12).</span></p>';
      }
    }, 380);
  });

  manualBtn.addEventListener('click', () => {
    resultsBox.innerHTML = '';
    searchInput.value = '';
    startDraft(blankDraft());
  });

  refreshBookList();
}

// Pełna, zawsze widoczna, przeszukiwalna lista wszystkich książek — kliknięcie otwiera podgląd/edycję
export function refreshBookList() {
  const host = document.getElementById('bookListSection');
  if (!host) return;
  if (draft) { host.innerHTML = ''; return; }

  const all = getBooks();
  if (all.length === 0) { host.innerHTML = ''; return; }

  const q = bookListFilter.trim().toLowerCase();
  const filtered = q ? all.filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)) : all;
  const sorted = [...filtered].sort((a, b) => a.title.localeCompare(b.title, 'pl'));

  host.innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <label>Wasze książki (${all.length}) — kliknij, żeby zobaczyć lub edytować</label>
      <input type="text" id="bookListFilter" placeholder="filtruj po tytule/autorze…" value="${escapeAttr(bookListFilter)}" style="margin-top:8px;" />
      <div class="chip-row" id="bookListRows" style="margin-top:10px;"></div>
    </div>
  `;
  document.getElementById('bookListFilter').addEventListener('input', e => {
    bookListFilter = e.target.value;
    refreshBookList();
    // zachowaj fokus i pozycję kursora po re-renderze
    const input = document.getElementById('bookListFilter');
    input.focus();
    input.selectionStart = input.selectionEnd = input.value.length;
  });

  const row = document.getElementById('bookListRows');
  if (sorted.length === 0) {
    row.innerHTML = '<p class="empty-note">Nic nie pasuje do filtra.</p>';
    return;
  }
  sorted.forEach(b => {
    const rs = b.readStatus || {};
    const chip = document.createElement('button');
    chip.className = 'chip'; chip.type = 'button';
    chip.innerHTML = `${escapeHtml(b.title)} <span style="opacity:.65;">${USERS.map(u => `${u.emoji}${STATUS_ICON[rs[u.id]] || '○'}`).join(' ')}</span>`;
    chip.addEventListener('click', () => startDraft(JSON.parse(JSON.stringify(b))));
    row.appendChild(chip);
  });
}

function renderSearchResults(results, box) {
  if (results.length === 0) { box.innerHTML = '<p class="empty-note">Brak wyników.</p>'; return; }
  box.innerHTML = '';
  results.forEach(r => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'search-result';
    el.innerHTML = `
      <img src="${r.coverUrl || ''}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="meta"><div class="t">${escapeHtml(r.title)}</div><div class="a">${escapeHtml(r.author)}${r.publishedYear ? ' · ' + r.publishedYear : ''}</div></div>
    `;
    el.addEventListener('click', () => {
      const d = blankDraft();
      Object.assign(d, { title: r.title, author: r.author, coverUrl: r.coverUrl, sourceId: r.sourceId, isbn: r.isbn });
      box.innerHTML = '';
      document.getElementById('bookSearch').value = '';
      startDraft(d);
    });
    box.appendChild(el);
  });
}

function startDraft(book) {
  draft = book;
  if (!draft.readStatus) draft.readStatus = { [USERS[0].id]: 'tbr', [USERS[1].id]: 'tbr' };
  if (!draft.wantToRead) draft.wantToRead = {};
  draftScores = {
    [USERS[0].id]: draft.ratings?.[USERS[0].id]?.scores ? { ...draft.ratings[USERS[0].id].scores } : {},
    [USERS[1].id]: draft.ratings?.[USERS[1].id]?.scores ? { ...draft.ratings[USERS[1].id].scores } : {},
  };
  activeUser = USERS[0].id;
  renderForm();
}

function renderForm() {
  refreshBookList();
  const container = document.getElementById('bookFormContainer');
  if (!draft) { container.innerHTML = ''; return; }

  container.innerHTML = `
    <div class="book-form card">
      <div class="book-form-head">
        <img class="cover-preview" src="${draft.coverUrl || ''}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="fields">
          <input type="text" id="f-title" placeholder="Tytuł" value="${escapeAttr(draft.title)}" />
          <input type="text" id="f-author" placeholder="Autor" value="${escapeAttr(draft.author)}" />
        </div>
      </div>

      <div class="two-col">
        <div class="field-row saga-field">
          <label for="f-saga">Saga (opcjonalnie)</label>
          <select id="f-saga"></select>
          <div id="newSagaRow" style="display:flex;gap:6px;margin-top:6px;">
            <input type="text" id="f-new-saga" placeholder="+ nowa saga…" />
            <button type="button" class="btn btn-sm" id="addSagaInlineBtn">Dodaj</button>
          </div>
        </div>
        <div class="field-row">
          <label>Format</label>
          <div class="chip-row" id="formatChips"></div>
        </div>
      </div>

      <div class="field-row">
        <label>Gatunek</label>
        <div class="chip-row" id="genreChips"></div>
      </div>

      <div id="raterBlock"></div>

      <div class="form-actions">
        <button class="btn btn-ghost" id="cancelBtn" type="button">Anuluj</button>
        <button class="btn btn-gold" id="saveBtn" type="button">Zapisz książkę</button>
      </div>
    </div>
  `;

  document.getElementById('f-title').addEventListener('input', e => draft.title = e.target.value);
  document.getElementById('f-author').addEventListener('input', e => draft.author = e.target.value);

  // saga select
  populateSagaSelect();
  document.getElementById('f-saga').addEventListener('change', e => { draft.saga = e.target.value || null; });
  document.getElementById('addSagaInlineBtn').addEventListener('click', async () => {
    const input = document.getElementById('f-new-saga');
    const name = input.value.trim();
    if (!name) return;
    const exists = getSagas().find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!exists) await addSaga(name);
    draft.saga = name;
    input.value = '';
    populateSagaSelect();
  });

  // genre chips
  const genreBox = document.getElementById('genreChips');
  ALL_GENRES.forEach(g => {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'chip'; chip.textContent = g;
    chip.classList.toggle('active', draft.genres.includes(g));
    chip.addEventListener('click', () => {
      draft.genres = draft.genres.includes(g) ? draft.genres.filter(x => x !== g) : [...draft.genres, g];
      chip.classList.toggle('active');
      renderRaterBlock();
    });
    genreBox.appendChild(chip);
  });

  // format chips
  const formatBox = document.getElementById('formatChips');
  FORMATS.forEach(f => {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'chip format'; chip.textContent = `${f.icon} ${f.label}`;
    chip.classList.toggle('active', draft.format === f.id);
    chip.addEventListener('click', () => {
      draft.format = draft.format === f.id ? null : f.id;
      [...formatBox.children].forEach(c => c.classList.remove('active'));
      if (draft.format) chip.classList.add('active');
    });
    formatBox.appendChild(chip);
  });

  document.getElementById('cancelBtn').addEventListener('click', () => { draft = null; renderForm(); });
  document.getElementById('saveBtn').addEventListener('click', saveDraft);

  renderRaterBlock();
}

function populateSagaSelect() {
  const select = document.getElementById('f-saga');
  if (!select) return;
  const sagas = getSagas();
  select.innerHTML = '<option value="">— brak sagi —</option>' +
    sagas.map(s => `<option value="${escapeAttr(s.name)}" ${draft.saga === s.name ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
}

function renderRaterBlock() {
  const block = document.getElementById('raterBlock');
  if (!block) return;
  const criteria = criteriaForGenres(draft.genres);
  const label = USERS.find(u => u.id === activeUser).label;
  const status = draft.readStatus[activeUser];

  block.innerHTML = `
    <div class="rater-block">
      <div class="rater-user-tabs" id="raterUserTabs"></div>
      <div class="field-row" style="margin-top:2px;">
        <label>Status (${label})</label>
        <div class="status-toggle" id="statusToggle"></div>
      </div>
      ${status === 'tbr' ? `
        <div class="field-row">
          <label>Zainteresowanie (${label})</label>
          <div class="chip-row" id="wantToggleRow"></div>
        </div>
      ` : ''}
      <div id="criteriaArea"></div>
    </div>
  `;

  const userTabs = document.getElementById('raterUserTabs');
  USERS.forEach(u => {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'chip';
    chip.textContent = `${u.emoji} ${u.label}`;
    chip.classList.toggle('active', u.id === activeUser);
    chip.addEventListener('click', () => { activeUser = u.id; renderRaterBlock(); });
    userTabs.appendChild(chip);
  });

  const statusBox = document.getElementById('statusToggle');
  READ_STATUSES.forEach(s => {
    const chip = document.createElement('button');
    chip.type = 'button'; chip.className = 'chip';
    chip.textContent = s.label;
    chip.classList.toggle('active', status === s.id);
    chip.addEventListener('click', () => {
      draft.readStatus[activeUser] = s.id;
      renderRaterBlock();
    });
    statusBox.appendChild(chip);
  });

  // "chcę przeczytać" — widoczne tylko dopóki ta osoba jeszcze nie zaczęła
  const wantRow = document.getElementById('wantToggleRow');
  if (wantRow) {
    const want = draft.wantToRead[activeUser];
    const opts = [{ v: true, l: 'chcę przeczytać' }, { v: false, l: 'nie teraz' }];
    opts.forEach(o => {
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'chip';
      chip.textContent = o.l;
      chip.classList.toggle('active', want === o.v);
      chip.addEventListener('click', () => {
        draft.wantToRead[activeUser] = want === o.v ? null : o.v;
        renderRaterBlock();
      });
      wantRow.appendChild(chip);
    });
  }

  const area = document.getElementById('criteriaArea');
  if (status !== 'przeczytana') {
    area.innerHTML = `<p class="empty-note" style="margin-top:10px;">Ocenianie odblokuje się, gdy ${label} oznaczy książkę jako przeczytaną.</p>`;
    return;
  }
  area.innerHTML = `<div id="criteriaList"></div><div class="rating-summary" id="ratingSummary"></div>`;
  const list = document.getElementById('criteriaList');
  criteria.forEach(c => list.appendChild(renderCriterionRow(c)));
  updateSummary();
}

function renderCriterionRow(crit) {
  const row = document.createElement('div');
  row.className = 'criterion';
  const current = draftScores[activeUser][crit.id];
  row.innerHTML = `
    <div class="c-name">${crit.id}. ${escapeHtml(crit.name)}</div>
    <div class="point-picker" data-crit="${crit.id}"></div>
    <div class="c-question">${escapeHtml(crit.question)}</div>
    <div class="c-level-text">${current ? escapeHtml(crit.levels[current - 1]) : '—'}</div>
  `;
  const picker = row.querySelector('.point-picker');
  for (let p = 1; p <= 5; p++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(p);
    btn.classList.toggle('active', current === p);
    btn.addEventListener('click', () => {
      draftScores[activeUser][crit.id] = p;
      row.querySelector('.c-level-text').textContent = crit.levels[p - 1];
      [...picker.children].forEach((b, i) => b.classList.toggle('active', i + 1 === p));
      updateSummary();
    });
    picker.appendChild(btn);
  }
  return row;
}

function updateSummary() {
  const box = document.getElementById('ratingSummary');
  if (!box) return;
  const result = calcRating(draftScores[activeUser], draft.genres);
  if (!result) {
    box.innerHTML = `<div class="sub">Zacznij oceniać, żeby zobaczyć wynik.</div>`;
    return;
  }
  box.innerHTML = `
    <div>
      <div class="big-percent">${result.percent}%</div>
      <div class="sub">${result.scoredCount}/${result.totalCriteria} kryteriów ocenionych</div>
    </div>
    <div style="text-align:right;">
      <div class="stars" style="font-size:20px;">${starsToString(result.stars)}</div>
      <span class="tier-badge" style="background:${result.tier.color};color:${result.tier.textColor};">
        <span class="dot" style="background:${result.tier.textColor};"></span>${result.tier.label}
      </span>
    </div>
  `;
}

async function saveDraft() {
  if (!draft.title.trim()) { alert('Podaj tytuł książki.'); return; }
  const ratings = { ...draft.ratings };
  USERS.forEach(u => {
    if (draft.readStatus[u.id] !== 'przeczytana') { ratings[u.id] = draft.ratings[u.id] || null; return; }
    const result = calcRating(draftScores[u.id], draft.genres);
    ratings[u.id] = result ? { scores: draftScores[u.id], percent: result.percent, stars: result.stars, tierId: result.tier.id } : (draft.ratings[u.id] || null);
  });
  const payload = {
    title: draft.title.trim(), author: draft.author.trim() || 'Autor nieznany',
    coverUrl: draft.coverUrl || '', sourceId: draft.sourceId || '', isbn: draft.isbn || '',
    genres: draft.genres, format: draft.format, saga: draft.saga || null,
    readStatus: draft.readStatus, addedBy: draft.addedBy, wantToRead: draft.wantToRead || {}, ratings,
  };
  if (draft.id) await updateBook(draft.id, payload);
  else await addBook(payload);
  draft = null;
  renderForm();
}

function escapeHtml(s = '') { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s = '') { return escapeHtml(s); }

export function openBookForRating(book) {
  startDraft(JSON.parse(JSON.stringify(book)));
}
