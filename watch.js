// watch.js — „Gdzie obejrzeć” (streaming w PL z TMDB) + widok „Na dziś”
import * as L from "./series-logic.js";

const MOODS = {
  any:    { n: "Dowolny nastrój", g: null },
  funny:  { n: "😂 Lekko i śmiesznie", g: ["Komedia", "Animacja", "Familijny", "Romans", "Muzyczny"] },
  thrill: { n: "😱 Dreszczyk", g: ["Thriller", "Horror", "Kryminał", "Tajemnica"] },
  action: { n: "💥 Akcja i rozmach", g: ["Akcja", "Sci-Fi", "Fantasy", "Wojenny", "Western"] },
  heart:  { n: "🥹 Wzruszenie", g: ["Dramat", "Romans", "Muzyczny"] },
  think:  { n: "🧠 Coś do myślenia", g: ["Dramat", "Dokumentalny", "Sci-Fi", "Historyczny", "Thriller"] },
};
const LOGO = "https://image.tmdb.org/t/p/w92";

export function initWatch(ctx) {
  const { fs, db, esc, TMDB_KEY, toast, getLists, getActiveList, getSeries, getSR, rateMovie, getRatings } = ctx;
  const { collection, doc, setDoc, onSnapshot } = fs;
  const CSET = collection(db, "kSettings");
  const el = id => document.getElementById(id);
  const hasKey = () => TMDB_KEY && !String(TMDB_KEY).startsWith("WSTAW");

  let MINE = new Set();             // id platform, które mamy
  const CACHE = {};                 // "movie_123" → {flatrate,rent,buy}
  const ui = { mood: "any", time: "0", source: "list", onlyMine: false, picks: [], busy: false };

  onSnapshot(CSET, s => {
    s.forEach(d => { if (d.id === "main") MINE = new Set((d.data().providers || []).map(Number)); });
    ctx.onChange && ctx.onChange();
  }, e => console.warn("kSettings:", e));

  /* ───── dostawcy streamingu ───── */
  async function providers(type, tmdbId) {
    if (!tmdbId || !hasKey()) return null;
    const key = type + "_" + tmdbId;
    if (CACHE[key] !== undefined) return CACHE[key];
    CACHE[key] = null;
    try {
      const r = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}/watch/providers?api_key=${TMDB_KEY}`);
      const d = await r.json();
      const pl = (d.results || {}).PL || null;
      CACHE[key] = pl ? {
        flatrate: (pl.flatrate || []).map(p => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path })),
        rent: (pl.rent || []).map(p => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path })),
        buy: (pl.buy || []).map(p => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path })),
      } : { flatrate: [], rent: [], buy: [] };
    } catch (_e) { CACHE[key] = null; }
    return CACHE[key];
  }
  const onMine = p => !!p && p.flatrate.some(x => MINE.has(x.id));
  function chips(p) {
    if (p === null || p === undefined) return `<span class="wh-none">brak danych</span>`;
    const logo = x => `<span class="wh-logo ${MINE.has(x.id) ? "mine" : ""}" title="${esc(x.name)}${MINE.has(x.id) ? " (mamy!)" : ""}">${x.logo ? `<img src="${LOGO + x.logo}" alt="${esc(x.name)}">` : esc(x.name)}</span>`;
    if (p.flatrate.length) return `<span class="wh-row"><b>W abonamencie:</b> ${p.flatrate.slice(0, 6).map(logo).join("")}</span>`;
    if (p.rent.length || p.buy.length) return `<span class="wh-row"><b>Wypożyczenie/zakup:</b> ${[...p.rent, ...p.buy].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i).slice(0, 5).map(logo).join("")}</span>`;
    return `<span class="wh-none">Nigdzie online w PL</span>`;
  }
  // wypełnia kontenery [data-wh="movie_123"] po wyrenderowaniu widoku
  async function hydrate(root) {
    const nodes = (root || document).querySelectorAll("[data-wh]");
    for (const n of nodes) {
      const [type, id] = n.dataset.wh.split("_");
      const p = await providers(type, id);
      n.innerHTML = chips(p);
      if (n.dataset.mineBadge !== undefined && onMine(p)) n.closest(".ls-item,.dz-card")?.classList.add("on-mine");
    }
  }

  /* ───── dialog „Moje platformy” ───── */
  async function openPlatforms() {
    const dlg = el("platformDialog"), box = el("platformList");
    box.innerHTML = `<div class="sr-hint">Ładuję platformy…</div>`;
    dlg.showModal();
    if (!hasKey()) { box.innerHTML = `<div class="sr-hint">Brak klucza TMDB.</div>`; return; }
    try {
      const r = await fetch(`https://api.themoviedb.org/3/watch/providers/movie?api_key=${TMDB_KEY}&language=pl-PL&watch_region=PL`);
      const list = ((await r.json()).results || []).sort((a, b) => (a.display_priorities?.PL ?? 99) - (b.display_priorities?.PL ?? 99)).slice(0, 36);
      box.innerHTML = list.map(p => `<label class="pf-item"><input type="checkbox" value="${p.provider_id}" ${MINE.has(p.provider_id) ? "checked" : ""}>
        ${p.logo_path ? `<img src="${LOGO + p.logo_path}" alt="">` : ""}<span>${esc(p.provider_name)}</span></label>`).join("");
    } catch (e) { box.innerHTML = `<div class="sr-hint">Błąd: ${esc(e.message)}</div>`; }
  }
  async function savePlatforms() {
    const ids = [...el("platformList").querySelectorAll("input:checked")].map(i => Number(i.value));
    MINE = new Set(ids);
    await setDoc(doc(CSET, "main"), { providers: ids }, { merge: true }).catch(e => toast("Nie udało się zapisać: " + e.message));
    el("platformDialog").close();
    toast(ids.length ? `Zapisano platformy: ${ids.length}` : "Wyczyszczono platformy");
    ctx.onChange && ctx.onChange();
  }

  /* ───── Na dziś ───── */
  function candidates() {
    const out = [];
    const ratings = getRatings() || {};
    const seen = new Set();
    if (ui.source === "list" || ui.source === "lists") {
      const src = ui.source === "list" ? [getActiveList()] : Object.values(getLists());
      for (const l of src) for (const it of l.items || []) {
        if ((!it.rewatch && (it.watched || ratings[it.id])) || seen.has(it.id)) continue;
        seen.add(it.id);
        out.push({ kind: "film", id: it.id, tmdbId: it.tmdbId, title: it.title, poster: it.poster, year: it.year, genre: it.genre, minutes: it.length || null, film: it });
      }
    }
    if (ui.source === "series") {
      const SERIES = getSeries(), SR = getSR();
      for (const [id, s] of Object.entries(SERIES)) {
        const st = L.jointStatus(SR[id], s.seasons);
        if (st === "done" || st === "dropped") continue;
        // następny odcinek dla osoby, która jest dalej w tyle
        const ps = ["kar", "adam"].filter(w => !(SR[id] && SR[id][w] && SR[id][w].notSeen));
        const behind = ps.map(w => ({ w, pr: L.progress((SR[id] || {})[w], s.seasons) })).sort((a, b) => a.pr.watched - b.pr.watched)[0];
        let next = null;
        for (const se of s.seasons) {
          for (let e = 1; e <= se.episodes && !next; e++) if (!L.isEpWatched(((SR[id] || {})[behind ? behind.w : "kar"]) || {}, se.n, e)) next = `S${se.n}E${e}`;
          if (next) break;
        }
        out.push({ kind: "serial", id, tmdbId: s.tmdbId, title: s.title, poster: s.poster, year: s.year, genre: s.genre, minutes: s.runtime || 45, next, status: st });
      }
    }
    return out;
  }
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  async function pick() {
    if (ui.busy) return; ui.busy = true;
    el("dz-result").innerHTML = `<div class="sr-hint">Dobieram wieczór…</div>`;
    const maxMin = Number(ui.time), mood = MOODS[ui.mood];
    let pool = candidates().filter(c =>
      (!maxMin || c.minutes === null || c.minutes <= maxMin) &&
      (!mood.g || mood.g.includes(c.genre)));
    shuffle(pool);
    let picks = [];
    if (ui.onlyMine) {
      for (let i = 0; i < pool.length && picks.length < 3 && i < 36; i += 6) {
        const batch = pool.slice(i, i + 6);
        const res = await Promise.all(batch.map(c => providers(c.kind === "film" ? "movie" : "tv", c.tmdbId)));
        batch.forEach((c, k) => { if (onMine(res[k]) && picks.length < 3) picks.push(c); });
      }
    } else picks = pool.slice(0, 3);
    ui.picks = picks; ui.busy = false;
    render(pool.length);
  }

  function render(poolSize) {
    const box = el("dz-result"); if (!box) return;
    const mineTxt = MINE.size ? `Mamy ${MINE.size} platform${MINE.size === 1 ? "ę" : MINE.size < 5 ? "y" : ""}` : "Nie wybrano platform";
    const btn = el("dz-mine-info"); if (btn) btn.textContent = mineTxt;
    if (poolSize === undefined && !ui.picks.length) { box.innerHTML = ""; return; }
    if (!ui.picks.length) {
      box.innerHTML = poolSize === undefined ? "" : `<div class="empty">Nic nie pasuje do tych kryteriów${ui.onlyMine ? " (albo nic nie ma na naszych platformach)" : ""}. Poluzuj filtry albo zmień źródło.</div>`;
      return;
    }
    box.innerHTML = `<div class="dz-grid">${ui.picks.map((c, i) => `<div class="dz-card">
      <div class="dz-no">${i + 1}</div>
      <div class="dz-poster">${c.poster ? `<img src="${esc(c.poster)}" alt="">` : "🎬"}</div>
      <div class="dz-info">
        <div class="dz-kind">${c.kind === "serial" ? `📺 Serial · następny: ${esc(c.next || "—")}` : "🎬 Film"}</div>
        <div class="dz-title">${esc(c.title)}</div>
        <div class="dz-meta">${[c.year, c.genre, c.minutes ? "~" + c.minutes + " min" : ""].filter(Boolean).map(esc).join(" · ")}</div>
        <div class="dz-wh" data-wh="${c.kind === "film" ? "movie" : "tv"}_${c.tmdbId}" data-mine-badge></div>
        <div class="dz-btns">
          ${c.kind === "film" ? `<button class="mc-btn primary" onclick="WT.rate(${i})">Oglądamy → oceń</button>` : `<button class="mc-btn primary" onclick="SX.open('${esc(c.id)}')">Otwórz serial</button>`}
        </div></div></div>`).join("")}</div>
      <button class="btn" style="margin-top:14px" onclick="WT.pick()">🎲 Inne propozycje</button>`;
    hydrate(box);
  }

  window.WT = {
    pick, openPlatforms, savePlatforms,
    rate(i) { const c = ui.picks[i]; if (c && c.film) rateMovie(c.film); },
  };

  // statyczne kontrolki
  el("dz-mood") && (el("dz-mood").innerHTML = Object.entries(MOODS).map(([k, m]) => `<option value="${k}">${m.n}</option>`).join(""));
  el("dz-mood")?.addEventListener("change", e => ui.mood = e.target.value);
  el("dz-time")?.addEventListener("change", e => ui.time = e.target.value);
  el("dz-source")?.addEventListener("change", e => ui.source = e.target.value);
  el("dz-mine")?.addEventListener("change", e => ui.onlyMine = e.target.checked);

  return { renderTonight: () => render(), hydrate, chips, providers, onMine };
}
