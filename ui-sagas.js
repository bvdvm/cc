import { USERS } from './config.js';
import { addSaga, deleteSaga } from './store.js';

let onOpenBook = () => {};
function avg(nums) { return nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null; }

export function initSagasPanel(openBookCallback) {
  onOpenBook = openBookCallback || (() => {});
  document.getElementById('addSagaBtn').addEventListener('click', async () => {
    const input = document.getElementById('newSagaName');
    const name = input.value.trim();
    if (!name) return;
    await addSaga(name);
    input.value = '';
  });
}

export function renderSagas(books, sagas) {
  const grid = document.getElementById('sagaGrid');

  if (sagas.length === 0) {
    grid.innerHTML = '<p class="empty-note">Nie macie jeszcze żadnej sagi. Dodajcie pierwszą powyżej.</p>';
    return;
  }

  grid.innerHTML = '';
  sagas.forEach(saga => {
    const sagaBooks = books.filter(b => b.saga === saga.name);
    const perUserAvg = USERS.map(u => ({
      user: u,
      value: avg(sagaBooks.map(b => b.ratings?.[u.id]?.percent).filter(v => typeof v === 'number')),
    }));
    const card = document.createElement('div');
    card.className = 'card saga-card';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <h3>${escapeHtml(saga.name)}</h3>
        <button type="button" class="btn btn-ghost btn-sm btn-danger delete-saga" aria-label="usuń sagę">usuń</button>
      </div>
      <div class="saga-avg-row">
        ${perUserAvg.map(p => `<span>${p.user.emoji} ${p.value !== null ? p.value + '%' : '—'}</span>`).join('')}
      </div>
      <div class="saga-books" id="sagaBooks-${saga.id}">
        ${sagaBooks.length ? '' : '<span class="saga-book-pill">jeszcze bez książek</span>'}
      </div>
    `;
    const booksBox = card.querySelector(`#sagaBooks-${saga.id}`);
    sagaBooks.forEach(b => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'saga-book-pill';
      pill.textContent = b.title;
      pill.addEventListener('click', () => onOpenBook(b));
      booksBox.appendChild(pill);
    });
    card.querySelector('.delete-saga').addEventListener('click', async () => {
      if (confirm(`Usunąć sagę "${saga.name}"? Zniknie z listy, ale przypisane książki zachowają tę nazwę, dopóki jej ręcznie nie zmienisz przy edycji.`)) {
        await deleteSaga(saga.id);
      }
    });
    grid.appendChild(card);
  });
}

function escapeHtml(s = '') { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
