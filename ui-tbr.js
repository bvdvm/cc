import { USERS } from './config.js';
import { updateBook } from './store.js';

let onRateNow = () => {};
export function initTbrPanel(rateNowCallback) { onRateNow = rateNowCallback; }

export function renderTBR(books) {
  const cols = { karolina: [], wspolna: [], ola: [] };

  books.forEach(b => {
    const rs = b.readStatus || {};
    const w = b.wantToRead || {};
    const kPending = rs.karolina === 'tbr';
    const oPending = rs.ola === 'tbr';
    const shared = kPending && oPending && w.karolina === true && w.ola === true;
    if (shared) { cols.wspolna.push(b); return; }
    if (kPending && w.karolina !== false) cols.karolina.push(b);
    if (oPending && w.ola !== false) cols.ola.push(b);
  });

  Object.entries(cols).forEach(([colKey, list]) => {
    const host = document.querySelector(`#tbrCol-${colKey} .tbr-list`);
    if (list.length === 0) { host.innerHTML = '<p class="empty-note">Pusto tutaj.</p>'; return; }
    host.innerHTML = '';
    list.forEach(b => host.appendChild(renderTbrCard(b)));
  });
}

function renderTbrCard(book) {
  const el = document.createElement('div');
  el.className = 'tbr-book';
  const w = book.wantToRead || {};
  const rs = book.readStatus || {};
  const pendingUsers = USERS.filter(u => rs[u.id] === 'tbr');
  el.innerHTML = `
    <div class="tb-title">${escapeHtml(book.title)}</div>
    <div class="tb-author">${escapeHtml(book.author)}</div>
    <div class="tb-actions">
      ${pendingUsers.map(u => `<button type="button" class="chip btn-sm want-toggle" data-user="${u.id}">${u.emoji} ${w[u.id] === true ? 'chce' : 'chce?'}</button>`).join('')}
      <button type="button" class="chip btn-sm rate-now">przeczytana → oceń</button>
    </div>
  `;
  el.querySelectorAll('.want-toggle').forEach(btn => {
    const uid = btn.dataset.user;
    btn.classList.toggle('active', w[uid] === true);
    btn.addEventListener('click', async () => {
      const next = { ...(book.wantToRead || {}), [uid]: w[uid] === true ? false : true };
      await updateBook(book.id, { wantToRead: next });
    });
  });
  el.querySelector('.rate-now').addEventListener('click', () => onRateNow(book));
  return el;
}

function escapeHtml(s = '') { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
