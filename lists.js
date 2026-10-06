// lists.js — nazwane listy oglądania z kolejnością, postępem i „Obejrzane” / „Obejrzane + oceń”

export function initLists(ctx) {
  const { fs, db, esc, getLv, pcSVG, TMDB_KEY, toast, getRatings, getMovies, fetchFilm, rateMovie, setRewatch } = ctx;
  const { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, getDocs } = fs;
  const CL = collection(db, "kLists");
  const COLD = collection(db, "kWatchlist"); // stara lista — jednorazowa migracja

  let LISTS = {};                 // id → { name, items:[...], created }
  const pending = new Set();
  const ui = { active: "default", hideDone: false, onlyMine: false };
  let loaded = false, migrating = false;
  const RW = "__rewatch";
  const el = id => document.getElementById(id);
  const rewatchItems = () => Object.values(getMovies() || {}).filter(f => f.rewatch && f.rewatch.on).sort((a, b) => String(a.rewatch.since || "").localeCompare(String(b.rewatch.since || "")))
    .map(f => ({ id: f.id, tmdbId: f.tmdbId, title: f.title, poster: f.poster, year: f.year, genre: f.genre, length: f.length, rewatch: true }));
  const hasKey = () => TMDB_KEY && !String(TMDB_KEY).startsWith("WSTAW");

  onSnapshot(CL, async s => {
    const n = {};
    s.forEach(d => { n[d.id] = pending.has(d.id) && LISTS[d.id] ? LISTS[d.id] : d.data(); });
    for (const id of pending) if (!n[id] && LISTS[id]) n[id] = LISTS[id];
    LISTS = n;
    if (!ui.active || (ui.active !== RW && !LISTS[ui.active])) ui.active = LISTS.default ? "default" : Object.keys(LISTS)[0] || "default";
    if (!loaded) { loaded = true; if (!LISTS.default) await migrate(); }
    changed();
  }, e => console.warn("kLists:", e));

  async function migrate() {
    if (migrating) return; migrating = true;
    let items = [];
    try {
      const old = await getDocs(COLD);
      old.forEach(d => items.push(clean({ ...d.data(), id: d.id })));
    } catch (_e) {}
    LISTS.default = { name: "Do obejrzenia", items, created: Date.now() };
    await setDoc(doc(CL, "default"), LISTS.default).catch(() => {});
  }
  const clean = f => JSON.parse(JSON.stringify({
    id: f.id, tmdbId: f.tmdbId ?? null, title: f.title, poster: f.poster ?? null, year: f.year ?? null,
    genre: f.genre ?? "", length: f.length ?? null, link: f.link ?? null, saga: f.saga ?? null,
    watched: !!f.watched, watchedAt: f.watchedAt ?? null,
  }));

  function changed() {
    renderLista();
    ctx.onChange && ctx.onChange();
  }
  async function save(id) {
    pending.add(id);
    renderLista();
    try { await setDoc(doc(CL, id), JSON.parse(JSON.stringify(LISTS[id]))); }
    catch (e) { toast && toast("Nie udało się zapisać: " + e.message); }
    pending.delete(id);
  }

  /* ───── API dla reszty aplikacji ───── */
  const isWatched = it => !!it.watched || !!(getRatings() || {})[it.id];
  function unwatchedMap() {
    const m = {};
    for (const l of Object.values(LISTS)) for (const it of l.items || []) if (!isWatched(it) && !m[it.id]) m[it.id] = it;
    return m;
  }
  async function addTo(listId, film) {
    if (!LISTS[listId]) { if (listId === "default") LISTS.default = { name: "Do obejrzenia", items: [], created: Date.now() }; else return false; }
    const l = LISTS[listId];
    if (l.items.some(i => i.id === film.id)) { toast && toast("Ten film jest już na liście „" + l.name + "”."); return false; }
    l.items.push(clean(film));
    await save(listId);
    toast && toast("Dodano do listy „" + l.name + "”");
    return true;
  }
  // Stała lista „Do obejrzenia” — tu trafiają wszystkie przyciski „+ Lista”
  const addToDefault = film => addTo("default", film);
  async function removeEverywhere(id) {
    for (const [lid, l] of Object.entries(LISTS)) {
      if (l.items.some(i => i.id === id)) { l.items = l.items.filter(i => i.id !== id); await save(lid); }
    }
  }

  /* ───── Akcje ───── */
  const find = (lid, id) => (LISTS[lid]?.items || []).find(i => i.id === id);
  const L_ = {
    pick(lid) { ui.active = lid; renderLista(); },
    async create() {
      const name = (prompt("Nazwa nowej listy:") || "").trim(); if (!name) return;
      const id = "l" + Date.now().toString(36);
      LISTS[id] = { name, items: [], created: Date.now() };
      ui.active = id; await save(id);
    },
    async rename() {
      const l = LISTS[ui.active]; if (!l) return;
      const name = (prompt("Nowa nazwa listy:", l.name) || "").trim(); if (!name) return;
      l.name = name; await save(ui.active);
    },
    async del() {
      const l = LISTS[ui.active]; if (!l) return;
      if (ui.active === "default") { if (!confirm("Wyczyścić listę „" + l.name + "”?")) return; l.items = []; await save("default"); return; }
      if (!confirm("Usunąć listę „" + l.name + "” razem z zawartością?")) return;
      const id = ui.active; ui.active = "default"; delete LISTS[id];
      await deleteDoc(doc(CL, id)).catch(() => {}); changed();
    },
    async move(id, dir) {
      const a = LISTS[ui.active]?.items; if (!a) return;
      const i = a.findIndex(x => x.id === id), j = i + dir;
      if (i < 0 || j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]]; await save(ui.active);
    },
    async top(id) {
      const a = LISTS[ui.active]?.items; if (!a) return;
      const i = a.findIndex(x => x.id === id); if (i <= 0) return;
      a.unshift(a.splice(i, 1)[0]); await save(ui.active);
    },
    async seen(id) {
      const it = find(ui.active, id); if (!it) return;
      it.watched = true; it.watchedAt = new Date().toISOString().slice(0, 10);
      // film oznaczony jako obejrzany na jednej liście — oznacz na pozostałych też
      for (const [lid, l] of Object.entries(LISTS)) if (lid !== ui.active) { const o = l.items.find(x => x.id === id); if (o && !o.watched) { o.watched = true; o.watchedAt = it.watchedAt; await save(lid); } }
      await save(ui.active);
    },
    async unseen(id) {
      for (const [lid, l] of Object.entries(LISTS)) { const o = l.items.find(x => x.id === id); if (o && o.watched) { o.watched = false; o.watchedAt = null; await save(lid); } }
    },
    async copyTo(id, lid) { const it = find(ui.active, id); if (it && lid) await addTo(lid, it); },
    rewatch(id) { const f = (getMovies() || {})[id]; if (f) rateMovie(f); },
    async unRewatch(id) { await setRewatch(id, false); },
    rate(id) { const it = find(ui.active, id); if (it) rateMovie(it); },
    async remove(id) { const l = LISTS[ui.active]; if (!l) return; l.items = l.items.filter(i => i.id !== id); await save(ui.active); },
    toggleMine() { ui.onlyMine = !ui.onlyMine; renderLista(); },
    toggleHide() { ui.hideDone = !ui.hideDone; renderLista(); },
    async add(tmdbId) {
      el("lista-results").innerHTML = `<div class="sr-hint">Dodaję…</div>`;
      try {
        const f = await fetchFilm(tmdbId);
        if (f) await addTo(LISTS[ui.active] ? ui.active : "default", f);
      } catch (e) { toast && toast("Błąd: " + e.message); }
      el("lista-results").innerHTML = ""; el("lista-search").value = "";
    },
  };
  window.LS = L_;

  /* ───── Wyszukiwarka (statyczny input — nie jest przerysowywany) ───── */
  let timer = null;
  el("lista-search")?.addEventListener("input", e => {
    clearTimeout(timer);
    const q = e.target.value.trim(), box = el("lista-results");
    if (q.length < 2) { box.innerHTML = ""; return; }
    timer = setTimeout(async () => {
      if (!hasKey()) { box.innerHTML = `<div class="sr-hint">Brak klucza TMDB w config.js.</div>`; return; }
      box.innerHTML = `<div class="sr-hint">Szukam…</div>`;
      try {
        const r = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=pl-PL&query=${encodeURIComponent(q)}`);
        const res = ((await r.json()).results || []).slice(0, 8);
        box.innerHTML = res.length ? res.map(x => `<button type="button" class="sr-item" onclick="LS.add(${x.id})">
          ${x.poster_path ? `<img src="https://image.tmdb.org/t/p/w185${x.poster_path}" alt="">` : '<div class="sr-ph">🎬</div>'}
          <span>${esc(x.title)} <small style="color:var(--muted)">(${(x.release_date || "").slice(0, 4) || "?"})</small></span></button>`).join("")
          : `<div class="sr-hint">Brak wyników.</div>`;
      } catch (_e) { box.innerHTML = `<div class="sr-hint">Błąd wyszukiwania.</div>`; }
    }, 350);
  });

  /* ───── Widok ───── */
  function renderLista() {
    const tabs = el("lista-tabs"), body = el("lista-body");
    if (!tabs || !body) return;
    const ids = Object.keys(LISTS).sort((a, b) => a === "default" ? -1 : b === "default" ? 1 : (LISTS[a].created || 0) - (LISTS[b].created || 0));
    if (!LISTS.default) LISTS.default = { name: "Do obejrzenia", items: [], created: 0 };
    if (!ids.includes("default")) ids.unshift("default");
    if (!ids.length) { tabs.innerHTML = ""; body.innerHTML = `<div class="empty">Ładowanie list…</div>`; return; }
    tabs.innerHTML = ids.map(id => {
      const l = LISTS[id], done = l.items.filter(isWatched).length;
      return `<button class="top-tab ${id === ui.active ? "active" : ""}" onclick="LS.pick('${id}')">📋 ${esc(l.name)} <small>${done}/${l.items.length}</small></button>`;
    }).join("") + `<button class="top-tab ${ui.active === RW ? "active" : ""}" onclick="LS.pick('${RW}')">🔁 Rewatch <small>${rewatchItems().length}</small></button><button class="top-tab" onclick="LS.create()">+ Nowa lista</button>`;
    if (ui.active === RW) { renderRewatch(body); ctx.afterRender && ctx.afterRender(body); return; }

    const l = LISTS[ui.active] || LISTS[ids[0]];
    const items = l.items || [];
    const done = items.filter(isWatched).length;
    const pct = items.length ? Math.round(done / items.length * 100) : 0;
    const cnt = el("lista-count"); if (cnt) cnt.textContent = items.length + " filmów";
    const vis = items.map((it, i) => ({ it, i })).filter(x => !(ui.hideDone && isWatched(x.it)));
    const R = getRatings() || {};
    body.innerHTML = `
      <div class="ls-head">
        <div class="ls-title">${ui.active === "default" ? "📌 " : ""}${esc(l.name)}</div>
        <div class="ls-actions">
          ${ui.active === "default" ? "" : `<button class="sx-mini" onclick="LS.rename()">✎ Zmień nazwę</button>`}
          <button class="sx-mini" onclick="WT.openPlatforms()">📡 Moje platformy</button>
          <button class="sx-mini ${ui.onlyMine ? "on" : ""}" onclick="LS.toggleMine()">${ui.onlyMine ? "✓ Tylko u nas" : "Tylko na naszych platformach"}</button>
          <button class="sx-mini" onclick="LS.toggleHide()">${ui.hideDone ? "Pokaż obejrzane" : "Ukryj obejrzane"}</button>
          <button class="sx-mini" style="color:var(--red)" onclick="LS.del()">${ui.active === "default" ? "Wyczyść" : "Usuń listę"}</button>
        </div>
      </div>
      <div class="ls-progress"><div class="ls-progress-track"><div class="ls-progress-fill" style="width:${pct}%"></div></div>
        <span>${done} / ${items.length} obejrzane · ${pct}%</span></div>
      ${vis.length ? `<div class="ls-items ${ui.onlyMine ? "only-mine" : ""}">${vis.map(({ it, i }) => {
        const rated = !!R[it.id], seen = isWatched(it);
        const pctJ = rated ? ctx.jointPct(it.id) : null, lv = pctJ !== null ? getLv(pctJ) : null;
        return `<div class="ls-item ${seen ? "seen" : ""}">
          <div class="ls-num">${i + 1}</div>
          <div class="ls-poster">${it.poster ? `<img src="${esc(it.poster)}" alt="" loading="lazy">` : "🎬"}</div>
          <div class="ls-info">
            <div class="ls-name">${seen ? "✓ " : ""}${esc(it.title)}</div>
            <div class="ls-meta">${[it.year, it.genre, it.length ? it.length + " min" : ""].filter(Boolean).map(esc).join(" · ")}${it.watchedAt && !rated ? ` · obejrzano ${esc(it.watchedAt)}` : ""}</div>
            ${it.tmdbId && !seen ? `<div class="ls-wh" data-wh="movie_${esc(it.tmdbId)}" data-mine-badge><span class="wh-none">sprawdzam streaming…</span></div>` : ""}
          </div>
          ${lv ? `<div class="rank-score">${pcSVG(lv.key, 26)}<div class="rank-avg" style="border-color:${lv.color};color:${lv.color}">${pctJ}%</div></div>` : ""}
          <div class="ls-btns">
            ${!seen ? `<button class="mc-btn" onclick="LS.seen('${esc(it.id)}')">Obejrzane</button>
                       <button class="mc-btn primary" onclick="LS.rate('${esc(it.id)}')">Obejrzane + oceń</button>`
                    : rated ? `<button class="mc-btn" onclick="LS.rate('${esc(it.id)}')">Edytuj ocenę</button>`
                            : `<button class="mc-btn primary" onclick="LS.rate('${esc(it.id)}')">Oceń</button>
                               <button class="mc-btn" onclick="LS.unseen('${esc(it.id)}')">Cofnij</button>`}
            ${ids.length > 1 ? `<select class="ls-copy" onchange="LS.copyTo('${esc(it.id)}',this.value);this.selectedIndex=0" title="Kopiuj do innej listy"><option value="">➜ Kopiuj do…</option>${ids.filter(x => x !== ui.active).map(x => `<option value="${x}">${esc(LISTS[x].name)}</option>`).join("")}</select>` : ""}
            <span class="ls-arrows">
              <button class="mc-btn" title="Na górę" onclick="LS.top('${esc(it.id)}')">⤒</button>
              <button class="mc-btn" title="Wyżej" onclick="LS.move('${esc(it.id)}',-1)">↑</button>
              <button class="mc-btn" title="Niżej" onclick="LS.move('${esc(it.id)}',1)">↓</button>
              <button class="mc-btn" title="Usuń z listy" onclick="LS.remove('${esc(it.id)}')">✕</button>
            </span>
          </div>
        </div>`;
      }).join("")}</div>` : `<div class="empty">${items.length ? "Wszystkie filmy obejrzane 🎉" : "Lista jest pusta — wyszukaj film powyżej, żeby go dodać."}</div>`}`;
    ctx.afterRender && ctx.afterRender(body);
}

  function renderRewatch(body) {
    const items = rewatchItems(), R = getRatings() || {}, M = getMovies() || {};
    const cnt = el("lista-count"); if (cnt) cnt.textContent = items.length + " filmów";
    body.innerHTML = `<div class="ls-head"><div class="ls-title">🔁 Rewatch</div></div>
      <div class="sx-hint">Filmy, do których chcemy wrócić. Po seansie ocenicie je od nowa, a poprzednia ocena zostaje w historii filmu. Dodasz film przyciskiem „🔁 Rewatch” w jego szczegółach.</div>
      ${items.length ? `<div class="ls-items">${items.map((it, i) => {
        const r = R[it.id] || {}, kP = ctx.personScore(r.kar), aP = ctx.personScore(r.adam), hist = (M[it.id] && M[it.id].history || []).length;
        return `<div class="ls-item">
          <div class="ls-num">${i + 1}</div>
          <div class="ls-poster">${it.poster ? `<img src="${esc(it.poster)}" alt="" loading="lazy">` : "🎬"}</div>
          <div class="ls-info"><div class="ls-name">${esc(it.title)}</div>
            <div class="ls-meta">${[it.year, it.genre].filter(Boolean).map(esc).join(" · ")}${kP !== null ? ` · 💛 ${kP}%` : ""}${aP !== null ? ` · 💙 ${aP}%` : ""}${hist ? ` · ${hist + 1}. raz` : ""}</div>
            ${it.tmdbId ? `<div class="ls-wh" data-wh="movie_${esc(it.tmdbId)}" data-mine-badge></div>` : ""}</div>
          <div class="ls-btns"><button class="mc-btn primary" onclick="LS.rewatch('${esc(it.id)}')">Oglądamy → oceń ponownie</button>
            <button class="mc-btn" onclick="LS.unRewatch('${esc(it.id)}')">✕</button></div></div>`;
      }).join("")}</div>` : `<div class="empty">Brak filmów w Rewatch. Otwórz oceniony film i kliknij „🔁 Rewatch”.</div>`}`;
  }

  return { renderLista, unwatchedMap, addTo, addToDefault, removeEverywhere, getLists: () => LISTS, getActive: () => ui.active === RW ? { id: RW, name: "Rewatch", items: rewatchItems() } : ({ id: ui.active, ...(LISTS[ui.active] || { items: [] }) }) };
}
