// series.js — seriale: biblioteka, rankingi, oceny (3 tryby), postęp, profil
import * as L from "./series-logic.js";

const WHO = { kar: { name: "Karolina", heart: "💛", short: "K" }, adam: { name: "Adam", heart: "💙", short: "A" } };
const MODES = [
  { k: "overall", n: "Ogólny",     d: "Cały serial w kategoriach" },
  { k: "season",  n: "Sezonowo",   d: "Każdy sezon w kategoriach" },
  { k: "episode", n: "Odcinkowo",  d: "Odcinki 0–5 ★ + sezon w kategoriach" },
];
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

export function initSeries(ctx) {
  const { fs, db, esc, getLv, pcSVG, TMDB_KEY, getGenreCats, toast } = ctx;
  const { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot } = fs;
  const CS = collection(db, "kSeries");
  const CR = collection(db, "kSRatings");

  let SERIES = {};            // id → serial
  let SR = {};                // id → { kar:{...}, adam:{...} }
  const pending = new Set();  // id z niezapisanymi zmianami lokalnymi
  const dirty = {};           // id → Set(kar/adam)
  const timers = {};
  const EPCACHE = {};         // "tmdbId_n" → [{e,name}]
  const ui = { tab: "lib", status: "all", sort: "added", who: "kar", openId: null, open: new Set() };

  const hasKey = () => TMDB_KEY && !String(TMDB_KEY).startsWith("WSTAW");
  const el = id => document.getElementById(id);
  const seasonsOf = id => (SERIES[id] && SERIES[id].seasons) || [];
  const person = (id, w) => (SR[id] && SR[id][w]) || {};
  const pctOf = (id, w) => L.seriesPct(person(id, w), seasonsOf(id));
  const jointOf = id => L.jointSeriesPct(SR[id], seasonsOf(id));

  /* ───────── Firestore ───────── */
  onSnapshot(CS, s => {
    SERIES = {}; s.forEach(d => SERIES[d.id] = d.data());
    rerender();
  }, e => console.warn("kSeries:", e));
  onSnapshot(CR, s => {
    const n = {};
    s.forEach(d => { n[d.id] = pending.has(d.id) && SR[d.id] ? SR[d.id] : d.data(); });
    for (const id of pending) if (!n[id] && SR[id]) n[id] = SR[id];
    SR = n;
    rerender();
  }, e => console.warn("kSRatings:", e));

  function rerender() {
    if (location.hash.replace("#", "") === "seriale") renderSeries();
    if (ui.openId && el("seriesDialog")?.open) renderDetail();
    ctx.onChange && ctx.onChange();
  }

  // Zwraca modyfikowalny obiekt osoby i oznacza go jako zmieniony
  function mut(id, w) {
    SR[id] = SR[id] || {};
    SR[id][w] = SR[id][w] || { mode: "overall" };
    return SR[id][w];
  }
  function touch(id, w) {
    pending.add(id);
    (dirty[id] = dirty[id] || new Set()).add(w);
    clearTimeout(timers[id]);
    timers[id] = setTimeout(() => flush(id), 400);
    renderDetail();
    renderSeries();
    ctx.onChange && ctx.onChange();
  }
  async function flush(id) {
    const ws = [...(dirty[id] || [])];
    dirty[id] = new Set();
    if (!ws.length) { pending.delete(id); return; }
    const ref = doc(CR, id);
    const data = {};
    for (const w of ws) data[w] = JSON.parse(JSON.stringify(SR[id][w] || {}));
    try { await updateDoc(ref, data); }
    catch (_e) {
      try { await setDoc(ref, data, { merge: true }); }
      catch (e2) { toast && toast("Nie udało się zapisać: " + e2.message); return; }
    }
    if (!dirty[id] || !dirty[id].size) pending.delete(id);
  }

  /* ───────── TMDB ───────── */
  async function tmdb(path) {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`https://api.themoviedb.org/3${path}${sep}api_key=${TMDB_KEY}&language=pl-PL`);
    if (!r.ok) throw new Error("TMDB " + r.status);
    return r.json();
  }
  function buildSeries(d) {
    return {
      id: "s" + d.id, tmdbId: d.id,
      title: d.name || d.original_name || "?",
      poster: d.poster_path ? TMDB_IMG + d.poster_path : null,
      year: (d.first_air_date || "").slice(0, 4) || null,
      genre: L.tvGenre((d.genres || []).map(g => g.id)),
      runtime: (d.episode_run_time && d.episode_run_time[0]) || (d.last_episode_to_air && d.last_episode_to_air.runtime) || 45,
      tmdbStatus: d.status || null,
      overview: d.overview || "",
      link: `https://www.themoviedb.org/tv/${d.id}`,
      seasons: (d.seasons || []).filter(s => s.season_number > 0 && s.episode_count > 0)
        .map(s => ({ n: s.season_number, episodes: s.episode_count, name: s.name || ("Sezon " + s.season_number) })),
    };
  }
  async function fetchEpisodes(id, n) {
    const s = SERIES[id]; if (!s || !hasKey()) return;
    const key = s.tmdbId + "_" + n;
    if (EPCACHE[key]) return;
    EPCACHE[key] = "loading";
    try {
      const d = await tmdb(`/tv/${s.tmdbId}/season/${n}`);
      EPCACHE[key] = (d.episodes || []).map(e => ({ e: e.episode_number, name: e.name || "" }));
    } catch (_e) { EPCACHE[key] = []; }
    if (ui.openId === id) renderDetail();
  }

  /* ───────── Dodawanie ───────── */
  let searchTimer = null;
  function openAdd() {
    el("seriesSearchInput").value = "";
    el("seriesSearchResults").innerHTML = "";
    el("seriesSearchDialog").showModal();
    el("seriesSearchInput").focus();
  }
  el("seriesSearchInput")?.addEventListener("input", e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (q.length < 2) { el("seriesSearchResults").innerHTML = ""; return; }
    searchTimer = setTimeout(() => runSearch(q), 350);
  });
  async function runSearch(q) {
    const box = el("seriesSearchResults");
    if (!hasKey()) { box.innerHTML = `<div class="sr-hint">Brak klucza TMDB w config.js.</div>`; return; }
    box.innerHTML = `<div class="sr-hint">Szukam…</div>`;
    try {
      const d = await tmdb(`/search/tv?query=${encodeURIComponent(q)}`);
      const res = d.results || [];
      if (!res.length) { box.innerHTML = `<div class="sr-hint">Brak wyników.</div>`; return; }
      box.innerHTML = res.slice(0, 12).map(r => `<button type="button" class="sr-item" onclick="SX.pick(${r.id})">
        ${r.poster_path ? `<img src="${TMDB_IMG + r.poster_path}" alt="">` : '<div class="sr-ph">📺</div>'}
        <span>${esc(r.name)} <small style="color:var(--muted)">(${(r.first_air_date || "").slice(0, 4) || "?"})</small></span>
      </button>`).join("");
    } catch (e) { box.innerHTML = `<div class="sr-hint">Błąd: ${esc(e.message)}</div>`; }
  }
  async function pick(tmdbId) {
    el("seriesSearchResults").innerHTML = `<div class="sr-hint">Pobieram sezony…</div>`;
    try {
      const s = buildSeries(await tmdb(`/tv/${tmdbId}`));
      if (!SERIES[s.id]) await setDoc(doc(CS, s.id), { ...s, added: Date.now() });
      else toast && toast("Ten serial już jest w bazie.");
      el("seriesSearchDialog").close();
      if (location.hash !== "#seriale") location.hash = "seriale";
      open(s.id);
    } catch (e) { el("seriesSearchResults").innerHTML = `<div class="sr-hint">Błąd: ${esc(e.message)}</div>`; }
  }
  async function refresh() {
    const s = SERIES[ui.openId]; if (!s || !hasKey()) return;
    try {
      const n = buildSeries(await tmdb(`/tv/${s.tmdbId}`));
      await updateDoc(doc(CS, s.id), { seasons: n.seasons, tmdbStatus: n.tmdbStatus, runtime: n.runtime, genre: n.genre, poster: n.poster, overview: n.overview });
      Object.keys(EPCACHE).forEach(k => { if (k.startsWith(s.tmdbId + "_")) delete EPCACHE[k]; });
      toast && toast("Zaktualizowano z TMDB");
    } catch (e) { toast && toast("Błąd: " + e.message); }
  }
  async function remove() {
    const id = ui.openId; if (!id) return;
    if (!confirm("Usunąć serial wraz ze wszystkimi ocenami?")) return;
    el("seriesDialog").close(); ui.openId = null;
    await deleteDoc(doc(CS, id)).catch(() => {});
    await deleteDoc(doc(CR, id)).catch(() => {});
    delete SR[id]; pending.delete(id);
  }

  /* ───────── Widoki: biblioteka i rankingi ───────── */
  const STATUS_FILTERS = [["all", "Wszystkie"], ["done", "Obejrzane w całości"], ["watching", "W trakcie"], ["todo", "Do obejrzenia"], ["dropped", "Porzucone"]];
  const scoreChip = p => {
    if (p === null || p === undefined) return "";
    const lv = getLv(p);
    return `<span class="sx-chip" style="border-color:${lv.color};color:${lv.color}">${p}%</span>`;
  };
  function bar(pr, w) {
    return `<div class="sx-bar" title="${WHO[w].name}: ${pr.watched}/${pr.total} odc.">
      <span class="sx-bar-who">${WHO[w].heart}</span>
      <div class="sx-bar-track"><div class="sx-bar-fill ${w}" style="width:${pr.pct}%"></div></div>
      <span class="sx-bar-n">${pr.pct}%</span></div>`;
  }
  function statusOfView(id) {
    const w = ui.tab;
    return (w === "kar" || w === "adam") ? L.statusOf(person(id, w), seasonsOf(id)) : L.jointStatus(SR[id], seasonsOf(id));
  }

  function renderSeries() {
    const body = el("seriale-body"); if (!body) return;
    const w = ui.tab;
    document.querySelectorAll("#seriale-tabs .top-tab").forEach(t => t.classList.toggle("active", t.dataset.stab === w));
    let ids = Object.keys(SERIES);
    const isRank = w !== "lib";
    if (isRank) ids = ids.filter(id => (w === "joint" ? jointOf(id) : pctOf(id, w)) !== null);
    if (w === "kar" || w === "adam") ids = ids.filter(id => !person(id, w).notSeen);
    if (ui.status !== "all") ids = ids.filter(id => statusOfView(id) === ui.status);
    const score = id => w === "joint" || w === "lib" ? jointOf(id) : pctOf(id, w);
    if (isRank) ids.sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1));
    else if (ui.sort === "score") ids.sort((a, b) => (score(b) ?? -1) - (score(a) ?? -1));
    else if (ui.sort === "title") ids.sort((a, b) => SERIES[a].title.localeCompare(SERIES[b].title, "pl"));
    else ids.sort((a, b) => (SERIES[b].added || 0) - (SERIES[a].added || 0));
    const cnt = el("seriale-count"); if (cnt) cnt.textContent = ids.length + " seriali";
    const sortSel = el("seriale-sort"); if (sortSel) sortSel.style.display = isRank ? "none" : "";
    if (!ids.length) {
      body.innerHTML = `<div class="empty">${Object.keys(SERIES).length ? "Brak seriali dla tego filtra." : "Brak seriali — dodaj pierwszy przyciskiem „+ Dodaj serial”."}</div>`;
      return;
    }
    body.innerHTML = isRank
      ? `<div class="rank-list">${ids.map((id, i) => rankRow(id, i, w)).join("")}</div>`
      : `<div class="movie-grid">${ids.map(libCard).join("")}</div>`;
  }

  function rankRow(id, i, w) {
    const s = SERIES[id], p = w === "joint" ? jointOf(id) : pctOf(id, w), lv = getLv(p);
    const st = statusOfView(id);
    return `<div class="rank-row ${i === 0 ? "gold" : ""}" onclick="SX.open('${esc(id)}')">
      <div class="rank-num">${i + 1}</div>
      <div class="rank-poster">${s.poster ? `<img src="${esc(s.poster)}" alt="" loading="lazy">` : "📺"}</div>
      <div class="rank-info"><span class="rank-title">${esc(s.title)}</span>
        <div class="rank-meta">
          ${s.year ? `<span>${esc(s.year)}</span>` : ""}${s.genre ? `<span>${esc(s.genre)}</span>` : ""}
          <span>${s.seasons.length} sez.</span><span class="sx-st ${st}">${L.STATUS_LABELS[st]}</span>
          <span style="color:${lv.color}">${lv.name}</span>
        </div></div>
      <div class="rank-score">${pcSVG(lv.key, 30)}<div class="rank-avg" style="border-color:${lv.color};color:${lv.color}">${p}%</div></div>
    </div>`;
  }
  function libCard(id) {
    const s = SERIES[id], p = jointOf(id), lv = p !== null ? getLv(p) : null;
    const kp = pctOf(id, "kar"), ap = pctOf(id, "adam");
    const st = L.jointStatus(SR[id], s.seasons);
    return `<div class="mcard" onclick="SX.open('${esc(id)}')">
      <div class="mc-poster">${s.poster ? `<img src="${esc(s.poster)}" alt="" loading="lazy">` : `<div class="mc-ph">📺</div>`}
        <div class="sx-badge-st ${st}">${L.STATUS_LABELS[st]}</div>
        ${lv ? `<div class="mc-badge">${pcSVG(lv.key, 26)}<div class="mc-pct" style="border-color:${lv.color};color:${lv.color}">${p}%</div></div>` : ""}
      </div>
      <div class="mc-body">
        <div class="mc-title">${esc(s.title)}</div>
        <div class="mc-meta"><span>${s.seasons.length} sez.</span>${s.year ? `<span>${esc(s.year)}</span>` : ""}${s.genre ? `<span class="genre">${esc(s.genre)}</span>` : ""}</div>
        ${lv ? `<div class="mc-level" style="color:${lv.color}">${lv.name}</div>` : ""}
        ${(kp !== null || ap !== null) ? `<div class="mc-scores">${kp !== null ? `<span>💛 <b style="color:${getLv(kp).color}">${kp}%</b></span>` : ""}${ap !== null ? `<span>💙 <b style="color:${getLv(ap).color}">${ap}%</b></span>` : ""}</div>` : ""}
        ${["kar", "adam"].map(w => person(id, w).notSeen ? `<div class="sx-bar-skip">${WHO[w].heart} nie ogląda</div>` : bar(L.progress(person(id, w), s.seasons), w)).join("")}
      </div></div>`;
  }

  /* ───────── Szczegóły serialu ───────── */
  function open(id) {
    if (!SERIES[id]) return;
    ui.openId = id;
    ui.open = new Set();
    el("seriesDialog").showModal();
    renderDetail();
  }
  function closeDlg() { el("seriesDialog").close(); }
  el("seriesDialog")?.addEventListener("close", () => { ui.openId = null; });

  const levelText = (cat, v) => (cat.pts && v ? cat.pts[v - 1] : "");

  function catsHTML(cats, map, scope) {
    return `<div class="cats-grid sx-cats">${cats.map((c, i) => {
      const v = map[String(i)] || 0;
      const isGenre = !c.pts;
      return `<div class="cat-card ${isGenre ? "genre" : ""}">
        <div class="cat-name">${esc(c.n)}${isGenre ? '<span class="gtag"> · gatunkowa</span>' : ""}</div>
        <div class="cat-stars">${[1, 2, 3, 4, 5].map(n => `<div class="star ${v >= n ? "on" : ""}" onclick="SX.cat('${scope}',${i},${n})">${n}</div>`).join("")}</div>
        <div class="sx-cat-desc">${v && c.pts ? esc(c.pts[v - 1]) : (c.pts ? "" : (v ? "" : ""))}</div>
      </div>`;
    }).join("")}</div>`;
  }
  const overallCats = id => [...L.SERIES_BASE_CATS, ...getGenreCats(SERIES[id].genre).map(n => ({ n }))];

  function seasonBlock(id, s, w, p, mode) {
    const n = s.n, open = ui.open.has(n);
    const watchedN = L.seasonWatched(p, s);
    const full = watchedN >= s.episodes;
    const sp = mode === "overall" ? null : L.seasonPct(p, n, s.episodes);
    const key = SERIES[id].tmdbId + "_" + n;
    let inner = "";
    if (open) {
      const names = Array.isArray(EPCACHE[key]) ? EPCACHE[key] : [];
      const nameOf = e => (names.find(x => x.e === e) || {}).name || "";
      inner += `<div class="sx-eps">${Array.from({ length: s.episodes }, (_, i) => i + 1).map(e => {
        const seen = L.isEpWatched(p, n, e);
        const rv = p.episodes && p.episodes[String(n)] ? p.episodes[String(n)][String(e)] : undefined;
        return `<div class="sx-ep ${seen ? "seen" : ""}">
          <button class="sx-ep-check" onclick="SX.ep(${n},${e})" title="Oznacz jako obejrzany">${seen ? "✓" : ""}</button>
          <div class="sx-ep-name"><b>${e}.</b> ${esc(nameOf(e))}</div>
          ${mode === "episode" ? `<div class="sx-ep-stars" title="${rv !== undefined ? L.EPISODE_LABELS[rv] : "Oceń odcinek 0–5"}">${[0, 1, 2, 3, 4, 5].map(v => `<span class="sx-es ${rv !== undefined && rv >= v && !(v === 0 && rv > 0) ? "on" : ""} ${v === 0 ? "z" : ""}" onclick="SX.epStar(${n},${e},${v})">${v === 0 ? "0" : "★"}</span>`).join("")}</div>` : ""}
        </div>`;
      }).join("")}</div>`;
      if (mode !== "overall") {
        const cats = L.SERIES_SEASON_CATS;
        const map = (p.seasons && p.seasons[String(n)] && p.seasons[String(n)].cats) || {};
        inner += `<div class="sx-sub">Ocena sezonu ${n} <span>· ${L.catsFilled(map)}/${cats.length} kategorii</span></div>${catsHTML(cats, map, "s" + n)}`;
        if (mode === "episode") {
          const ep = L.episodePct(p.episodes && p.episodes[String(n)], s.episodes), cp = L.catsPct(map);
          inner += `<div class="sx-formula">Odcinki: <b>${ep === null ? "—" : ep + "%"}</b> · Kategorie: <b>${cp === null ? "—" : cp + "%"}</b> → sezon: <b>${sp === null ? "—" : sp + "%"}</b> <small>(50% odcinki + 50% kategorie)</small></div>`;
        }
      }
    }
    return `<div class="sx-season ${open ? "open" : ""}">
      <div class="sx-season-hd" onclick="SX.toggleSeason(${n})">
        <span class="sx-caret">${open ? "▾" : "▸"}</span>
        <span class="sx-season-name">${esc(s.name || "Sezon " + n)}</span>
        <span class="sx-season-n">${watchedN}/${s.episodes} odc.</span>
        ${sp !== null ? scoreChip(sp) : ""}
        <button class="sx-mini ${full ? "on" : ""}" onclick="event.stopPropagation();SX.season(${n},${full ? "false" : "true"})">${full ? "✓ cały obejrzany" : "Cały obejrzany"}</button>
      </div>${inner}</div>`;
  }

  function renderDetail() {
    const id = ui.openId, dlg = el("seriesDialog");
    if (!id || !SERIES[id] || !dlg || !dlg.open) return;
    const s = SERIES[id], w = ui.who, p = person(id, w), mode = p.mode || "overall";
    const scrollTop = dlg.scrollTop;
    const jp = jointOf(id), jlv = jp !== null ? getLv(jp) : null;
    const prs = { kar: L.progress(person(id, "kar"), s.seasons), adam: L.progress(person(id, "adam"), s.seasons) };
    const eps = s.seasons.reduce((a, x) => a + x.episodes, 0);
    const kp = pctOf(id, "kar"), ap = pctOf(id, "adam");

    let work = "";
    if (p.notSeen) {
      work = `<div class="rf-not-seen-info">${WHO[w].name} nie ogląda tego serialu — ocena nie wlicza się do wyniku wspólnego.<br>Kliknij powyżej, jeśli to się zmieni.</div>`;
    } else {
      const map = (p.overall && p.overall.cats) || {};
      work = `
        <div class="rf-section-label">Tryb oceny (${WHO[w].name})</div>
        <div class="sx-modes">${MODES.map(m => `<button class="sx-mode ${mode === m.k ? "active" : ""}" onclick="SX.mode('${m.k}')"><b>${m.n}</b><small>${m.d}</small></button>`).join("")}</div>
        ${mode === "overall" ? `<div class="sx-sub">Ocena całego serialu <span>· ${L.catsFilled(map)}/${overallCats(id).length} kategorii</span></div>${catsHTML(overallCats(id), map, "o")}` : ""}
        <div class="sx-sub">Sezony i odcinki
          <span class="sx-bulk"><button class="sx-mini" onclick="SX.all(true)">Wszystko obejrzane</button><button class="sx-mini" onclick="SX.all(false)">Wyczyść</button></span></div>
        ${mode === "episode" ? `<div class="sx-hint">Oceń odcinki 0–5 ★ (rozwiń sezon), a potem sezon w kategoriach. Wynik sezonu = 50% średnia odcinków + 50% kategorie.</div>` : ""}
        ${mode === "season" ? `<div class="sx-hint">Oceń każdy sezon w kategoriach (rozwiń sezon). Wynik serialu = średnia sezonów.</div>` : ""}
        <div class="sx-seasons">${s.seasons.map(se => seasonBlock(id, se, w, p, mode)).join("")}</div>`;
    }

    el("seriesContent").innerHTML = `
      <div class="sx-head">
        <div class="rf-poster">${s.poster ? `<img src="${esc(s.poster)}" alt="">` : "📺"}</div>
        <div class="sx-head-info">
          <div class="rf-movie-title">${esc(s.title)}</div>
          <div class="rf-movie-meta">${[s.genre, s.year, s.seasons.length + " sez.", eps + " odc.", s.runtime ? "~" + s.runtime + " min/odc." : ""].filter(Boolean).join(" · ")}</div>
          ${s.overview ? `<div class="sx-overview">${esc(s.overview.length > 260 ? s.overview.slice(0, 257) + "…" : s.overview)}</div>` : ""}
          <div class="sx-scores">
            ${jlv ? `<div class="sx-score-main">${pcSVG(jlv.key, 34)}<div><b style="color:${jlv.color}">${jp}%</b><small style="color:${jlv.color}">${jlv.name}</small></div></div>` : `<div class="sx-score-main muted">Brak oceny</div>`}
            ${kp !== null ? `<span class="sx-chip" style="border-color:${getLv(kp).color};color:${getLv(kp).color}">💛 ${kp}%</span>` : ""}
            ${ap !== null ? `<span class="sx-chip" style="border-color:${getLv(ap).color};color:${getLv(ap).color}">💙 ${ap}%</span>` : ""}
          </div>
        </div>
        <button class="btn sx-x" onclick="SX.close()">✕</button>
      </div>
      <div class="sx-progress">${["kar", "adam"].map(x => person(id, x).notSeen
        ? `<div class="sx-bar-skip">${WHO[x].heart} ${WHO[x].name} nie ogląda</div>`
        : `${bar(prs[x], x)}<div class="sx-bar-sub">${WHO[x].name}: ${prs[x].watched}/${prs[x].total} odc. · <span class="sx-st ${L.statusOf(person(id, x), s.seasons)}">${L.STATUS_LABELS[L.statusOf(person(id, x), s.seasons)]}</span></div>`).join("")}</div>
      <div class="rf-ptabs" style="gap:6px;margin:12px 0 8px">
        ${["kar", "adam"].map(x => `<button class="rf-ptab ${w === x ? "active" : ""} ${person(id, x).notSeen ? "not-seen" : ""}" onclick="SX.who('${x}')">${WHO[x].heart} ${WHO[x].name}${person(id, x).notSeen ? " · nie ogląda" : ""}</button>`).join("")}
      </div>
      <div class="sx-toggles">
        <button class="rf-seen-toggle ${p.notSeen ? "notseen" : "seen"}" onclick="SX.notSeen()">${p.notSeen ? `${WHO[w].name} nie ogląda · kliknij, żeby cofnąć` : `✓ ${WHO[w].name} ogląda · kliknij, jeśli nie oglądała/nie oglądał`}</button>
        ${p.notSeen ? "" : `<button class="sx-mini ${p.dropped ? "on" : ""}" onclick="SX.dropped()">${p.dropped ? "🚫 Porzucony (cofnij)" : "Porzuć serial"}</button>`}
      </div>
      ${work}
      <div class="dialog-actions" style="margin-top:16px;justify-content:space-between">
        <span><button class="btn" onclick="SX.refresh()">↻ Odśwież z TMDB</button> <button class="btn" onclick="SX.remove()" style="color:var(--red)">Usuń</button></span>
        <button class="btn btn-primary" onclick="SX.close()">Gotowe</button>
      </div>`;
    dlg.scrollTop = scrollTop;

    // doładuj nazwy odcinków dla rozwiniętych sezonów
    for (const n of ui.open) if (!EPCACHE[s.tmdbId + "_" + n]) fetchEpisodes(id, n);
  }

  /* ───────── Akcje (inline onclick) ───────── */
  const cur = () => ui.openId;
  const SX = {
    open, close: closeDlg, openAdd, pick, refresh, remove,
    who(x) { ui.who = x; renderDetail(); },
    notSeen() { const p = mut(cur(), ui.who); p.notSeen = !p.notSeen; touch(cur(), ui.who); },
    dropped() { const p = mut(cur(), ui.who); p.dropped = !p.dropped; touch(cur(), ui.who); },
    mode(m) { const p = mut(cur(), ui.who); p.mode = m; touch(cur(), ui.who); },
    cat(scope, i, v) {
      const p = mut(cur(), ui.who);
      if (scope === "o") { p.overall = p.overall || { cats: {} }; p.overall.cats = p.overall.cats || {}; L.setCat(p.overall.cats, i, v); }
      else {
        const n = scope.slice(1);
        p.seasons = p.seasons || {}; p.seasons[n] = p.seasons[n] || { cats: {} }; p.seasons[n].cats = p.seasons[n].cats || {};
        L.setCat(p.seasons[n].cats, i, v);
      }
      touch(cur(), ui.who);
    },
    ep(n, e) { L.toggleEp(mut(cur(), ui.who), n, e); touch(cur(), ui.who); },
    epStar(n, e, v) { L.setEpisodeRating(mut(cur(), ui.who), n, e, v); touch(cur(), ui.who); },
    season(n, on) { const se = seasonsOf(cur()).find(x => x.n === n); if (se) { L.setSeasonWatched(mut(cur(), ui.who), se, on); touch(cur(), ui.who); } },
    all(on) { L.setAllWatched(mut(cur(), ui.who), seasonsOf(cur()), on); touch(cur(), ui.who); },
    toggleSeason(n) {
      if (ui.open.has(n)) ui.open.delete(n); else { ui.open.add(n); fetchEpisodes(cur(), n); }
      renderDetail();
    },
  };
  window.SX = SX;

  // statyczne kontrolki widoku
  document.getElementById("seriale-tabs")?.addEventListener("click", e => {
    const b = e.target.closest("[data-stab]"); if (!b) return;
    ui.tab = b.dataset.stab; renderSeries();
  });
  el("seriale-status")?.addEventListener("change", e => { ui.status = e.target.value; renderSeries(); });
  el("seriale-sort")?.addEventListener("change", e => { ui.sort = e.target.value; renderSeries(); });
  const sel = el("seriale-status");
  if (sel) sel.innerHTML = STATUS_FILTERS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("");

  /* ───────── Profil ───────── */
  function profileHTML(w) {
    const rows = Object.keys(SERIES).filter(id => !person(id, w).notSeen);
    const scored = rows.map(id => ({ id, p: pctOf(id, w) })).filter(x => x.p !== null).sort((a, b) => b.p - a.p);
    const statuses = rows.map(id => L.statusOf(person(id, w), seasonsOf(id)));
    const cnt = k => statuses.filter(x => x === k).length;
    const eps = rows.reduce((a, id) => a + L.progress(person(id, w), seasonsOf(id)).watched, 0);
    const mins = rows.reduce((a, id) => a + L.totalMinutes(person(id, w), SERIES[id]), 0);
    if (!rows.length || (!scored.length && !eps)) {
      return `<div class="section"><div class="sec-hd"><h2>📺 Seriale</h2></div><div class="empty">Brak seriali — dodaj pierwszy w zakładce Seriale.</div></div>`;
    }
    const avg = scored.length ? Math.round(scored.reduce((a, x) => a + x.p, 0) / scored.length) : null;
    const gen = {};
    scored.forEach(({ id, p }) => { const g = SERIES[id].genre; if (g) (gen[g] = gen[g] || []).push(p); });
    const fav = Object.entries(gen).map(([g, a]) => [g, Math.round(a.reduce((x, y) => x + y, 0) / a.length)]).sort((a, b) => b[1] - a[1])[0];
    const modes = { overall: 0, season: 0, episode: 0 };
    rows.forEach(id => { const m = person(id, w).mode || "overall"; if (pctOf(id, w) !== null) modes[m]++; });
    const fav2 = Object.entries(modes).sort((a, b) => b[1] - a[1])[0];
    const mini = ({ id, p }, i) => { const s = SERIES[id], lv = getLv(p); return `<div class="rank-row ${i === 0 ? "gold" : ""}" onclick="SX.open('${esc(id)}')">
      <div class="rank-num">${i + 1}</div><div class="rank-poster">${s.poster ? `<img src="${esc(s.poster)}" alt="">` : "📺"}</div>
      <div class="rank-info"><span class="rank-title">${esc(s.title)}</span><div class="rank-meta">${esc(s.genre || "")} ${s.year ? "· " + s.year : ""}</div></div>
      <div class="rank-avg" style="border-color:${lv.color};color:${lv.color}">${p}%</div></div>`; };
    const hrs = Math.floor(mins / 60);
    return `<div class="section">
      <div class="sec-hd"><h2>📺 Seriale</h2><button class="see-all" onclick="setView('seriale')">Zobacz wszystkie →</button></div>
      <div class="profile-quick-stats sx-pqs">
        <div class="pqs-item"><div class="pqs-val">${rows.length}</div><div class="pqs-lbl">W bazie</div></div>
        <div class="pqs-item"><div class="pqs-val">${cnt("done")}</div><div class="pqs-lbl">Obejrzane w całości</div></div>
        <div class="pqs-item"><div class="pqs-val">${cnt("watching")}</div><div class="pqs-lbl">W trakcie</div></div>
        <div class="pqs-item"><div class="pqs-val">${cnt("dropped")}</div><div class="pqs-lbl">Porzucone</div></div>
        <div class="pqs-item"><div class="pqs-val">${eps}</div><div class="pqs-lbl">Odcinków</div></div>
        <div class="pqs-item"><div class="pqs-val">${hrs >= 48 ? Math.round(hrs / 24 * 10) / 10 + " d" : hrs + " h"}</div><div class="pqs-lbl">Czas serialowy</div></div>
        ${avg !== null ? `<div class="pqs-item"><div class="pqs-val" style="color:${getLv(avg).color}">${avg}%</div><div class="pqs-lbl">Średnia ocena</div></div>` : ""}
        ${fav ? `<div class="pqs-item"><div class="pqs-val">${esc(fav[0])}</div><div class="pqs-lbl">Ulubiony gatunek</div></div>` : ""}
        ${fav2 && fav2[1] ? `<div class="pqs-item"><div class="pqs-val">${MODES.find(m => m.k === fav2[0]).n}</div><div class="pqs-lbl">Ulubiony tryb</div></div>` : ""}
      </div>
      ${scored.length ? `<div class="profile-cols" style="margin-top:14px">
        <div><div class="sec-hd"><h2 style="color:var(--ok)">⭐ Top 3 seriale</h2></div><div class="rank-list">${scored.slice(0, 3).map(mini).join("")}</div></div>
        ${scored.length > 3 ? `<div><div class="sec-hd"><h2 style="color:var(--red)">🍿 Najsłabsze</h2></div><div class="rank-list">${scored.slice(-Math.min(3, scored.length - 3)).reverse().map(mini).join("")}</div></div>` : ""}
      </div>` : ""}
    </div>`;
  }

  /* ───────── Zasady ───────── */
  function zasadyHTML() {
    const block = (cats, offset, tag) => cats.map((c, i) => `<div class="zasady-cat">
      <div class="zasady-cat-head"><div class="zasady-cat-num">${i + 1}</div><div class="zasady-cat-title">${esc(c.n)}</div><div class="zasady-cat-pts">${tag}</div></div>
      <div class="zasady-cat-body">${c.pts.map((d, n) => `<div class="zasady-pt"><div class="zasady-pt-num">${n + 1} pkt</div><div class="zasady-pt-desc">${esc(d)}</div></div>`).join("")}</div></div>`).join("");
    return `
      <div class="sx-zasady-hd"><h2>📺 Seriale — zasady oceniania</h2>
        <p>Każda osoba wybiera <b>własny tryb</b> dla każdego serialu. Ten, kto serialu nie oglądał, oznacza „nie ogląda” i nie wlicza się do wyniku wspólnego. Skala popcornów jest taka sama jak dla filmów.</p></div>
      <div class="sx-modes-info">
        <div><b>Ogólny</b><span>8 kategorii bazowych + 2 gatunkowe = maks. 50 pkt. Wynik = % zdobytych punktów.</span></div>
        <div><b>Sezonowo</b><span>Każdy sezon oceniany w 7 kategoriach (maks. 35 pkt). Wynik serialu = średnia sezonów, aktualizowana na bieżąco.</span></div>
        <div><b>Odcinkowo</b><span>Odcinki 0–5 ★ + sezon w 7 kategoriach. Wynik sezonu = 50% średnia gwiazdek odcinków + 50% kategorie sezonu. Wynik serialu = średnia sezonów.</span></div>
      </div>
      <div class="sx-sub-title">Tryb ogólny — 8 kategorii bazowych</div>${block(L.SERIES_BASE_CATS, 0, "1–5 pkt")}
      <div class="sx-sub-title">Sezon — 7 kategorii (tryb sezonowy i odcinkowy)</div>${block(L.SERIES_SEASON_CATS, 0, "1–5 pkt")}
      <div class="sx-sub-title">Gwiazdki odcinka (0–5)</div>
      <div class="zasady-cat"><div class="zasady-cat-body">${L.EPISODE_LABELS.map((d, n) => `<div class="zasady-pt"><div class="zasady-pt-num">${n} ★</div><div class="zasady-pt-desc">${esc(d)}</div></div>`).join("")}</div></div>`;
  }

  return { renderSeries, profileHTML, zasadyHTML, openAdd, getSeries: () => SERIES, getSR: () => SR,
    scores: () => { const out = []; for (const id of Object.keys(SERIES)) for (const w of ["kar", "adam"]) { if (person(id, w).notSeen) continue; const p = pctOf(id, w); if (p !== null) out.push({ id, who: w, pct: p }); } return out; } };
}
