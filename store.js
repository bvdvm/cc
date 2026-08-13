import { firebaseConfig, COLLECTIONS } from './config.js';
import { DEMO_BOOKS, DEMO_PICK_LISTS, DEMO_SAGAS } from './demo-data.js';

export let DEMO_MODE = true;
let db = null;
let fs = null; // firestore functions namespace

// --- stan demo (w pamięci, znika po odświeżeniu — bez localStorage) ---
let demoBooks = JSON.parse(JSON.stringify(DEMO_BOOKS));
let demoPickLists = JSON.parse(JSON.stringify(DEMO_PICK_LISTS));
let demoSagas = JSON.parse(JSON.stringify(DEMO_SAGAS));
const bookListeners = new Set();
const pickListListeners = new Set();
const sagaListeners = new Set();
function notifyBooks() { bookListeners.forEach(cb => cb([...demoBooks])); }
function notifyPickLists() { pickListListeners.forEach(cb => cb([...demoPickLists])); }
function notifySagas() { sagaListeners.forEach(cb => cb([...demoSagas])); }
function uid(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export async function initStore() {
  const looksConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('TWOJ_');
  if (!looksConfigured) {
    DEMO_MODE = true;
    return { demo: true };
  }
  try {
    const [{ initializeApp }, firestoreMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js'),
    ]);
    fs = firestoreMod;
    const app = initializeApp(firebaseConfig);
    db = fs.getFirestore(app);
    DEMO_MODE = false;
    return { demo: false };
  } catch (err) {
    console.warn('Firebase niedostępny, przechodzę w tryb demo:', err);
    DEMO_MODE = true;
    return { demo: true, error: err };
  }
}

// ---------------- KSIĄŻKI ----------------

export function subscribeBooks(callback) {
  if (DEMO_MODE) {
    bookListeners.add(callback);
    callback([...demoBooks]);
    return () => bookListeners.delete(callback);
  }
  const col = fs.collection(db, COLLECTIONS.books);
  return fs.onSnapshot(col, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addBook(data) {
  if (DEMO_MODE) {
    const book = { id: uid('book'), ratings: { karolina: null, ola: null }, wantToRead: {}, ...data };
    demoBooks.push(book);
    notifyBooks();
    return book.id;
  }
  const ref = await fs.addDoc(fs.collection(db, COLLECTIONS.books), {
    ratings: { karolina: null, ola: null }, wantToRead: {}, createdAt: Date.now(), ...data,
  });
  return ref.id;
}

export async function updateBook(id, patch) {
  if (DEMO_MODE) {
    demoBooks = demoBooks.map(b => (b.id === id ? { ...b, ...patch } : b));
    notifyBooks();
    return;
  }
  await fs.updateDoc(fs.doc(db, COLLECTIONS.books, id), patch);
}

export async function deleteBook(id) {
  if (DEMO_MODE) {
    demoBooks = demoBooks.filter(b => b.id !== id);
    notifyBooks();
    demoPickLists = demoPickLists.map(p => ({ ...p, bookIds: p.bookIds.filter(bid => bid !== id) }));
    notifyPickLists();
    return;
  }
  await fs.deleteDoc(fs.doc(db, COLLECTIONS.books, id));
}

// ---------------- LISTY DO LOSOWANIA ----------------

export function subscribePickLists(callback) {
  if (DEMO_MODE) {
    pickListListeners.add(callback);
    callback([...demoPickLists]);
    return () => pickListListeners.delete(callback);
  }
  const col = fs.collection(db, COLLECTIONS.pickLists);
  return fs.onSnapshot(col, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addPickList(name) {
  if (DEMO_MODE) {
    const list = { id: uid('pick'), name, bookIds: [] };
    demoPickLists.push(list);
    notifyPickLists();
    return list.id;
  }
  const ref = await fs.addDoc(fs.collection(db, COLLECTIONS.pickLists), { name, bookIds: [] });
  return ref.id;
}

export async function updatePickList(id, patch) {
  if (DEMO_MODE) {
    demoPickLists = demoPickLists.map(p => (p.id === id ? { ...p, ...patch } : p));
    notifyPickLists();
    return;
  }
  await fs.updateDoc(fs.doc(db, COLLECTIONS.pickLists, id), patch);
}

export async function deletePickList(id) {
  if (DEMO_MODE) {
    demoPickLists = demoPickLists.filter(p => p.id !== id);
    notifyPickLists();
    return;
  }
  await fs.deleteDoc(fs.doc(db, COLLECTIONS.pickLists, id));
}

// ---------------- SAGI ----------------

export function subscribeSagas(callback) {
  if (DEMO_MODE) {
    sagaListeners.add(callback);
    callback([...demoSagas]);
    return () => sagaListeners.delete(callback);
  }
  const col = fs.collection(db, COLLECTIONS.sagas);
  return fs.onSnapshot(col, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function addSaga(name) {
  if (DEMO_MODE) {
    const saga = { id: uid('saga'), name };
    demoSagas.push(saga);
    notifySagas();
    return saga.id;
  }
  const ref = await fs.addDoc(fs.collection(db, COLLECTIONS.sagas), { name });
  return ref.id;
}

export async function deleteSaga(id) {
  if (DEMO_MODE) {
    demoSagas = demoSagas.filter(s => s.id !== id);
    notifySagas();
    return;
  }
  await fs.deleteDoc(fs.doc(db, COLLECTIONS.sagas, id));
}
