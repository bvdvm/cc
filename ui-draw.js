import { addPickList, updatePickList, deletePickList } from './store.js';

let latestBooks = [];
let latestLists = [];

export function initDrawPanel() {
  document.getElementById('addListBtn').addEventListener('click', async () => {
    const input = document.getElementById('newListName');
    const name = input.value.trim();
    if (!name) return;
    await addPickList(name);
    input.value = '';
  });
  document.getElementById('drawBtn').addEventListener('click', drawFromSelected);
}

export function renderDraw(books, pickLists) {
  latestBooks = books;
  latestLists = pickLists;
  renderLists();
  renderListSelect();
}

function bookById(id) { return latestBooks.find(b => b.id === id); }

function renderLists() {
  const host = document.getElementById('drawLists');
  if (latestLists.length === 0) {
    host.innerHTML = '<p class="empty-note" style="text-align:center;">Brak puli. Dodaj pierwszą poniżej.</p>';
    return;
  }
  host.innerHTML = '';
  latestLists.forEach(list => {
    const card = document.createElement('div');
    card.className = 'card draw-list-card';
    const poolBooks = list.bookIds.map(bookById).filter(Boolean);
    card.innerHTML = `
      <div class="dl-head">
        <h3>${escapeHtml(list.name)}</h3>
        <button type="button" class="btn btn-ghost btn-sm btn-danger delete-list">usuń pulę</button>
      </div>
      <div class="draw-pool"></div>
      <select class="add-to-pool">
        <option value="">+ dodaj książkę do puli…</option>
      </select>
    `;
    const pool = card.querySelector('.draw-pool');
    if (poolBooks.length === 0) pool.innerHTML = '<p class="empty-note">Pusta pula.</p>';
    poolBooks.forEach(b => {
      const pill = document.createElement('span');
      pill.className = 'pool-pill';
      pill.innerHTML = `${escapeHtml(b.title)} <button type="button" aria-label="usuń">×</button>`;
      pill.querySelector('button').addEventListener('click', async () => {
        await updatePickList(list.id, { bookIds: list.bookIds.filter(id => id !== b.id) });
      });
      pool.appendChild(pill);
    });

    const select = card.querySelector('.add-to-pool');
    latestBooks.filter(b => !list.bookIds.includes(b.id)).forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id; opt.textContent = b.title;
      select.appendChild(opt);
    });
    select.addEventListener('change', async () => {
      if (!select.value) return;
      await updatePickList(list.id, { bookIds: [...list.bookIds, select.value] });
    });

    card.querySelector('.delete-list').addEventListener('click', async () => {
      if (confirm(`Usunąć pulę "${list.name}"?`)) await deletePickList(list.id);
    });

    host.appendChild(card);
  });
}

function renderListSelect() {
  const select = document.getElementById('drawListSelect');
  const prev = select.value;
  select.innerHTML = '<option value="">wybierz pulę…</option>' + latestLists.map(l => `<option value="${l.id}">${escapeHtml(l.name)} (${l.bookIds.length})</option>`).join('');
  if (latestLists.some(l => l.id === prev)) select.value = prev;
}

function drawFromSelected() {
  const select = document.getElementById('drawListSelect');
  const list = latestLists.find(l => l.id === select.value);
  const resultBox = document.getElementById('drawResult');
  if (!list || list.bookIds.length === 0) {
    resultBox.innerHTML = '<p class="empty-note">Wybierz pulę z co najmniej jedną książką.</p>';
    return;
  }
  const poolBooks = list.bookIds.map(bookById).filter(Boolean);
  resultBox.classList.add('shuffling');
  resultBox.innerHTML = '<p class="empty-note">Losuję…</p>';
  let ticks = 0;
  const timer = setInterval(() => {
    const flash = poolBooks[Math.floor(Math.random() * poolBooks.length)];
    resultBox.innerHTML = `<div class="dr-title">${escapeHtml(flash.title)}</div>`;
    ticks++;
    if (ticks > 10) {
      clearInterval(timer);
      resultBox.classList.remove('shuffling');
      const winner = poolBooks[Math.floor(Math.random() * poolBooks.length)];
      resultBox.innerHTML = `
        <img src="${winner.coverUrl || ''}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="dr-title">${escapeHtml(winner.title)}</div>
        <div class="dr-author">${escapeHtml(winner.author)}</div>
      `;
    }
  }, 90);
}

function escapeHtml(s = '') { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
