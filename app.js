"use strict";
import { firebaseConfig, TMDB_KEY } from "./config.js";
import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getFirestore, collection, doc,
  setDoc, deleteDoc, updateDoc,
  onSnapshot, getDoc,
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

/* ═══════════════════════════════════════════════
   FIREBASE INIT
═══════════════════════════════════════════════ */
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);

const COLL = {
  movies:   collection(db, "kMovies"),    // baza filmów
  ratings:  collection(db, "kRatings"),   // oceny per film
  watchlist:collection(db, "kWatchlist"), // do obejrzenia
  details:  collection(db, "kDetails"),   // cache obsady z TMDB
};

let MOVIES   = {};  // id → film
let RATINGS  = {};  // id → { kar:{cats,where,noteShort,noteLong}, adam:{...} }
let WATCHLIST = {}; // id → film
let DB_FILMS  = { months:{}, showtimes:{}, updated:null }; // data/films.json

let fbError = false;
function showFbError(e) {
  if (fbError) return;
  fbError = true;
  document.getElementById("firebase-error").style.display = "block";
  document.getElementById("firebase-error").textContent =
    "⚠️ Błąd Firebase: " + e.message + " — sprawdź config.js i reguły Firestore.";
}

onSnapshot(COLL.movies,   s => { MOVIES   = {}; s.forEach(d => MOVIES[d.id]   = d.data()); renderCurrentView(); }, showFbError);
onSnapshot(COLL.ratings,  s => { RATINGS  = {}; s.forEach(d => RATINGS[d.id]  = d.data()); renderCurrentView(); }, showFbError);
onSnapshot(COLL.watchlist,s => { WATCHLIST= {}; s.forEach(d => WATCHLIST[d.id]= d.data()); renderCurrentView(); }, showFbError);

/* ═══════════════════════════════════════════════
   POPCORN / OCENY
═══════════════════════════════════════════════ */
const LEVELS = [
  { key:"matcha", name:"Matcha Popcorn",    min:0,  max:29,  c1:"#3D9E52", c2:"#2D8040", bc:"#D42B2B", color:"#3D9E52" },
  { key:"kar",    name:"Karmelowy Popcorn", min:30, max:49,  c1:"#C87820", c2:"#9E5C10", bc:"#D42B2B", color:"#C87820" },
  { key:"sol",    name:"Solony Popcorn",    min:50, max:79,  c1:"#DDD5B8", c2:"#C4B896", bc:"#D42B2B", color:"#BDB09A" },
  { key:"boski",  name:"Boski Popcorn",     min:80, max:100, c1:"#F5C45A", c2:"#E8952A", bc:"#E8952A", color:"#E8952A" },
];
function getLv(pct) { return LEVELS.find(l => pct >= l.min && pct <= l.max) || LEVELS[0]; }

function pcSVG(key, sz = 36) {
  const l = LEVELS.find(x => x.key === key) || LEVELS[0];
  const w = sz, h = sz;
  const rays = key === "boski" ? [...Array(8)].map((_, i) => {
    const a = i * 45 * Math.PI / 180, r1 = w * .4, r2 = w * .53;
    return `<line x1="${(w/2+Math.cos(a)*r1).toFixed(1)}" y1="${(h*.28+Math.sin(a)*r1).toFixed(1)}" x2="${(w/2+Math.cos(a)*r2).toFixed(1)}" y2="${(h*.28+Math.sin(a)*r2).toFixed(1)}" stroke="${l.c2}" stroke-width="1.5" stroke-linecap="round"/>`;
  }).join("") : "";
  const f = (n) => n.toFixed(1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">${rays}
    <ellipse cx="${f(w*.34)}" cy="${f(h*.25)}" rx="${f(w*.13)}" ry="${f(w*.12)}" fill="${l.c1}"/>
    <ellipse cx="${f(w*.54)}" cy="${f(h*.21)}" rx="${f(w*.15)}" ry="${f(w*.14)}" fill="${l.c2}"/>
    <ellipse cx="${f(w*.7)}"  cy="${f(h*.26)}" rx="${f(w*.12)}" ry="${f(w*.11)}" fill="${l.c1}"/>
    <ellipse cx="${f(w*.2)}"  cy="${f(h*.3)}"  rx="${f(w*.11)}" ry="${f(w*.1)}"  fill="${l.c2}"/>
    <ellipse cx="${f(w*.48)}" cy="${f(h*.33)}" rx="${f(w*.12)}" ry="${f(w*.11)}" fill="${l.c1}"/>
    <path d="M${f(w*.18)} ${f(h*.43)} L${f(w*.25)} ${f(h*.85)} L${f(w*.75)} ${f(h*.85)} L${f(w*.82)} ${f(h*.43)} Z" fill="${l.bc}"/>
    <rect x="${f(w*.18)}" y="${f(h*.41)}" width="${f(w*.64)}" height="${f(h*.06)}" rx="2" fill="${l.c1}"/>
    <rect x="${f(w*.29)}" y="${f(h*.43)}" width="${f(w*.08)}" height="${f(h*.42)}" fill="#fff" opacity=".3"/>
    <rect x="${f(w*.63)}" y="${f(h*.43)}" width="${f(w*.08)}" height="${f(h*.42)}" fill="#fff" opacity=".3"/>
  </svg>`;
}

// 8 kategorii bazowych
const BASE_CATS = [
  "Fabuła / Historia", "Oryginalność", "Plot twist", "Bohaterowie",
  "Gra aktorska", "Emocje / Wrażenia", "Moralność / Przesłanie", "Pamięć po obejrzeniu"
];
// 2 kategorie gatunkowe per gatunek
const GENRE_CATS = {
  "Akcja":       ["Choreografia i widowiskowość akcji",   "Tempo i dynamika narracji"],
  "Animacja":    ["Jakość animacji i strona wizualna",    "Przekaz dla różnych grup wiekowych"],
  "Dokumentalny":["Wartość informacyjna",                 "Obiektywizm i rzetelność przekazu"],
  "Dramat":      ["Głębia emocjonalna",                   "Realizm i wiarygodność sytuacji"],
  "Fantasy":     ["Kreacja i oryginalność świata",        "Magia i elementy fantastyczne"],
  "Horror":      ["Atmosfera grozy i klimat napięcia",    "Skuteczność jumpscary i suspensu"],
  "Komedia":     ["Humor i śmieszność",                   "Lekkość klimatu rozrywki"],
  "Romans":      ["Chemia między postaciami",             "Emocjonalność i przekonujący romans"],
  "Sci-Fi":      ["Oryginalność wizji przyszłości",       "Logiczność i spójność świata"],
  "Thriller":    ["Napięcie i suspens",                   "Nieprzewidywalność zakończenia"],
};
const DEFAULT_GENRE_CATS = ["Klimat i atmosfera", "Oryginalność i innowacyjność"];

function getGenreCats(genre) { return GENRE_CATS[genre] || DEFAULT_GENRE_CATS; }
function allCats(genre)      { return [...BASE_CATS, ...getGenreCats(genre)]; }

function personScore(personRating) {
  if (!personRating?.cats) return null;
  if (personRating.watched === false) return null;  // nie widziała/ał
  const sum = personRating.cats.reduce((a, b) => a + b, 0);
  return Math.round(sum / 50 * 100);
}
function jointPct(id) {
  const r = RATINGS[id];
  if (!r) return null;
  const k = personScore(r.kar), a = personScore(r.adam);
  if (k === null && a === null) return null;
  const vals = [k, a].filter(v => v !== null);
  return Math.round(vals.reduce((x, y) => x + y, 0) / vals.length);
}

/* ═══════════════════════════════════════════════
   TMDB
═══════════════════════════════════════════════ */
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const GENRE_ID_MAP = {
  28:"Akcja",12:"Akcja",16:"Animacja",35:"Komedia",
  80:"Kryminał",99:"Dokumentalny",18:"Dramat",
  10751:"Familijny",14:"Fantasy",36:"Historyczny",
  27:"Horror",10402:"Muzyczny",9648:"Tajemnica",
  10749:"Romans",878:"Sci-Fi",53:"Thriller",
  10752:"Wojenny",37:"Western"
};
function tmdbGenre(ids) {
  if (!ids?.length) return "";
  for (const id of ids) if (GENRE_ID_MAP[id]) return GENRE_ID_MAP[id];
  return "";
}
let searchTimer = null;
async function tmdbSearch(q, type = "movie") {
  if (!TMDB_KEY || TMDB_KEY.startsWith("WSTAW")) return [];
  try {
    const r = await fetch(`https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_KEY}&language=pl-PL&query=${encodeURIComponent(q)}`);
    const d = await r.json();
    return (d.results || []).slice(0, 8);
  } catch { return []; }
}
async function tmdbDetails(id) {
  try {
    const r = await fetch(`https://api.themoviedb.org/3/movie/${id}?api_key=${TMDB_KEY}&language=pl-PL`);
    return await r.json();
  } catch { return null; }
}
const TMDB_IMG_SM = "https://image.tmdb.org/t/p/w185";
async function getCast(movieId, tmdbId) {
  if (!tmdbId) return null;
  try {
    // Check Firestore cache — prefer new "people" format
    const snap = await getDoc(doc(COLL.details, String(movieId)));
    if (snap.exists()) {
      const d = snap.data();
      if (d.people?.length) return d.people;
      // legacy format — migrate on next fresh fetch
    }
    if (!TMDB_KEY || TMDB_KEY.startsWith("WSTAW")) return null;
    const r = await fetch(
      `https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${TMDB_KEY}&language=pl-PL`
    );
    if (!r.ok) return null;
    const d = await r.json();
    const dir = (d.crew || []).find(c => c.job === "Director");
    const actors = (d.cast || []).slice(0, 7);
    const people = [
      ...(dir ? [{
        name:  dir.name,
        role:  "director",
        photo: dir.profile_path ? TMDB_IMG_SM + dir.profile_path : null,
      }] : []),
      ...actors.map(a => ({
        name:  a.name,
        role:  "actor",
        photo: a.profile_path ? TMDB_IMG_SM + a.profile_path : null,
        char:  a.character || null,
      })),
    ];
    await setDoc(doc(COLL.details, String(movieId)), { people, tmdbId });
    return people;
  } catch(e) { console.warn("getCast error:", e); return null; }
}

/* ═══════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════ */
function esc(s) { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; }
function fmtDt(iso) {
  const d = new Date(iso); if (isNaN(d)) return iso;
  return d.toLocaleDateString("pl-PL", { weekday:"short", day:"numeric", month:"numeric" })
    + " " + d.toLocaleTimeString("pl-PL", { hour:"2-digit", minute:"2-digit" });
}
function monthLabel(m) {
  const MN = ["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
  const [y, mo] = m.split("-"); return `${MN[+mo-1]} '${y.slice(2)}`;
}

/* ═══════════════════════════════════════════════
   MOVIE CARD
═══════════════════════════════════════════════ */
function mCard(film, mode) {
  const id  = film.id;
  const p   = jointPct(id);
  const lv  = p !== null ? getLv(p) : null;
  const r   = RATINGS[id];
  const kP  = r?.kar ? personScore(r.kar)  : null;
  const aP  = r?.adam ? personScore(r.adam) : null;
  const whereIn = r?.kar?.where || r?.adam?.where || null;
  const poster  = film.poster
    ? `<img src="${esc(film.poster)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      + `<div class="mc-ph" style="display:none">🎬</div>`
    : `<div class="mc-ph">🎬</div>`;
  const noteKar = r?.kar?.noteShort;
  const noteAdam = r?.adam?.noteShort;

  return `<div class="mcard" data-id="${esc(id)}" onclick="openDetail('${esc(id)}')">
    <div class="mc-poster">
      ${poster}
      ${whereIn ? `<div class="mc-where ${whereIn}">${whereIn === "kino" ? "🎟️ Kino" : "🏠 Dom"}</div>` : ""}
      ${lv ? `<div class="mc-badge">
        ${pcSVG(lv.key, 26)}
        <div class="mc-pct" style="border-color:${lv.color};color:${lv.color}">${p}%</div>
      </div>` : ""}
    </div>
    <div class="mc-body">
      <div class="mc-title">${esc(film.title)}</div>
      <div class="mc-meta">
        ${film.length ? `<span>${film.length} min</span>` : ""}
        ${film.year   ? `<span>${esc(film.year)}</span>`  : ""}
        ${film.genre  ? `<span class="genre">${esc(film.genre)}</span>` : ""}
      </div>
      ${lv ? `<div class="mc-level" style="color:${lv.color}">${lv.name}</div>` : ""}
      ${(kP !== null || aP !== null) ? `<div class="mc-scores">
        ${kP !== null ? `<span>💛 <b style="color:${getLv(kP).color}">${kP}%</b></span>` : ""}
        ${aP !== null ? `<span>💙 <b style="color:${getLv(aP).color}">${aP}%</b></span>` : ""}
      </div>` : ""}
      ${noteKar || noteAdam ? `<div class="note-line">
        ${noteKar  ? `<span class="note-k">K: ${esc(noteKar)}</span>` : ""}
        ${noteAdam ? `<span class="note-a">A: ${esc(noteAdam)}</span>` : ""}
      </div>` : ""}
      ${film.saga ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:9px;color:var(--gold)">🏷️ ${esc(film.saga)}</div>` : ""}
      <div class="mc-btns">
        ${mode === "watchlist" ?
          `<button class="mc-btn primary" onclick="event.stopPropagation();openRating('${esc(id)}')">OCEŃ</button>
           <button class="mc-btn" onclick="event.stopPropagation();removeFromWatchlist('${esc(id)}')">Usuń</button>` :
          mode === "ocena" ?
          `<button class="mc-btn primary" onclick="event.stopPropagation();openRating('${esc(id)}')">Edytuj ocenę</button>` :
          `<button class="mc-btn" onclick="event.stopPropagation();addToWatchlist('${esc(id)}')">+ Lista</button>`}
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════
   RANK ROW
═══════════════════════════════════════════════ */
function rankRow(film, i, key) {
  const p = key === "kar"  ? personScore(RATINGS[film.id]?.kar)
          : key === "adam" ? personScore(RATINGS[film.id]?.adam)
          : jointPct(film.id);
  if (p === null) return "";
  const lv = getLv(p);
  const whereIn = RATINGS[film.id]?.kar?.where || RATINGS[film.id]?.adam?.where || "";
  return `<div class="rank-row ${i === 0 ? "gold" : ""}" onclick="openDetail('${esc(film.id)}')">
    <div class="rank-num">${i + 1}</div>
    <div class="rank-poster">
      ${film.poster ? `<img src="${esc(film.poster)}" alt="" loading="lazy">` : "🎬"}
    </div>
    <div class="rank-info">
      <span class="rank-title">${esc(film.title)}</span>
      <div class="rank-meta">
        ${film.year   ? `<span>${esc(film.year)}</span>` : ""}
        ${film.genre  ? `<span>${esc(film.genre)}</span>` : ""}
        ${whereIn     ? `<span>${whereIn === "kino" ? "🎟️ kino" : "🏠 dom"}</span>` : ""}
        ${film.saga   ? `<span>🏷️ ${esc(film.saga)}</span>` : ""}
        <span style="color:${lv.color}">${lv.name}</span>
      </div>
    </div>
    <div class="rank-score">
      ${pcSVG(lv.key, 30)}
      <div class="rank-avg" style="border-color:${lv.color};color:${lv.color}">${p}%</div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════
   RENDER VIEWS
═══════════════════════════════════════════════ */

// ── HOME ──
function renderHome() {
  // hero — TMDB trending
  fetchTmdbTrending().then(trending => {
    if (!trending.length) return;
    const f = trending[0];
    document.getElementById("hero-title").textContent = f.title;
    document.getElementById("hero-desc").textContent =
      [f.genre, f.length ? f.length + " min" : "", f.year].filter(Boolean).join(" · ");
    if (f.poster) {
      const bg = document.getElementById("hero-bg");
      bg.innerHTML = `<img src="${f.poster.replace("w342","w780")}" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0">`;
      bg.style.position = "relative";
    }
    const side = trending.slice(1, 3);
    document.getElementById("hero-side").innerHTML = side.map(s => `
      <div class="hero-side-item" onclick="setView('lista')" style="position:relative;overflow:hidden">
        ${s.poster ? `<img src="${esc(s.poster)}" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0">` : '<div class="hsi-ph">🎬</div>'}
        <div class="hsi-ov"><div class="hsi-title">${esc(s.title)} ${s.year?"("+esc(s.year)+")":""}</div></div>
      </div>`).join("");
    // films grid — trending 2-8
    document.getElementById("home-now-sub").textContent = "Popularne teraz · TMDB";
    document.getElementById("home-now").innerHTML = trending.slice(0, 8).map(f => {
      const rated = !!MOVIES[f.id] && !!RATINGS[f.id];
      return `<div class="mcard" onclick="${rated ? `openDetail('${esc(f.id)}')` : `addToWatchlist('${esc(f.id)}',${JSON.stringify(f).replace(/"/g,'&quot;')})`}">
        <div class="mc-poster">
          ${f.poster ? `<img src="${esc(f.poster)}" alt="" loading="lazy">` : '<div class="mc-ph">🎬</div>'}
          ${rated && RATINGS[f.id] ? (() => { const p=jointPct(f.id),lv=getLv(p); return `<div class="mc-badge">${pcSVG(lv.key,22)}<div class="mc-pct" style="border-color:${lv.color};color:${lv.color}">${p}%</div></div>`; })() : ""}
        </div>
        <div class="mc-body">
          <div class="mc-title">${esc(f.title)}</div>
          <div class="mc-meta"><span>${esc(f.genre||"")}</span>${f.year?`<span>${esc(f.year)}</span>`:""}</div>
          <div class="mc-btns">
            ${rated ? '<button class="mc-btn">Szczegóły →</button>' : '<button class="mc-btn primary">+ Do listy</button>'}
          </div>
        </div>
      </div>`;
    }).join("");
  });

  // top 3
  const rated = Object.values(MOVIES)
    .filter(f => RATINGS[f.id])
    .sort((a, b) => (jointPct(b.id) ?? -1) - (jointPct(a.id) ?? -1))
    .slice(0, 3);
  document.getElementById("home-rank").innerHTML = rated.length
    ? rated.map((f, i) => rankRow(f, i, "joint")).join("")
    : "<div class='empty'>Ocenione filmy pojawią się tutaj.</div>";
}

// ── SEANSE ──
function renderSeanse() {
  const allFilms = Object.values(currentMonthFilms());
  const cinema = document.getElementById("seanse-cinema")?.value || "";
  const dateF  = document.getElementById("seanse-date")?.value  || "";

  const filtered = allFilms.filter(f => {
    if (cinema && !(f.cinemas || []).some(c => c.includes(cinema))) return false;
    return true;
  });

  document.getElementById("seanse-count").textContent = filtered.length + " filmów";
  if (!filtered.length) {
    document.getElementById("seanse-list").innerHTML = "<div class='empty'>Brak filmów w repertuarze. Uruchom GitHub Action, żeby pobrać aktualne seanse.</div>";
    return;
  }
  document.getElementById("seanse-list").innerHTML = filtered.map(f => {
    const shows = (DB_FILMS.showtimes?.[f.id] || []).slice().sort((a,b)=>String(a.dt).localeCompare(String(b.dt))).filter(e => new Date(e.dt) > new Date()).slice(0, 5);
    const isWatched = !!RATINGS[f.id];
    const isOnList  = !!WATCHLIST[f.id];
    return `<div class="showtime-row">
      <div class="st-poster">
        ${f.poster ? `<img src="${esc(f.poster)}" alt="" loading="lazy">` : "🎬"}
      </div>
      <div class="st-info">
        <div class="st-title">${esc(f.title)}</div>
        <div class="st-meta">${[f.genre, f.length ? f.length+" min" : ""].filter(Boolean).join(" · ")} · ${(f.cinemas||[]).map(c=>c.replace("Poznań ","")).join(", ")}</div>
        ${shows.length ? `<div class="st-times">${shows.map(e => `
          <div class="st-time ${(e.attrs||[]).includes("imax")?"imax":""}">${fmtDt(e.dt)}</div>`).join("")}
        </div>` : ""}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${isWatched
          ? `<button class="st-add" style="background:var(--ok)" onclick="openDetail('${esc(f.id)}')">✓ Oceniony</button>`
          : isOnList
          ? `<button class="st-add" style="background:#555;color:#ccc" onclick="setView('lista')">Na liście</button>`
          : `<button class="st-add" onclick="addToWatchlist('${esc(f.id)}',${JSON.stringify(f)})">+ Do listy</button>`}
      </div>
    </div>`;
  }).join("");
}

// ── OCENY ──
function renderOceny() {
  const levelF = document.getElementById("oceny-filter-level")?.value || "";
  const whereF = document.getElementById("oceny-filter-where")?.value || "";

  let films = Object.values(MOVIES).filter(f => RATINGS[f.id]);
  if (levelF) films = films.filter(f => { const p = jointPct(f.id); return p !== null && getLv(p).key === levelF; });
  if (whereF) films = films.filter(f => {
    const r = RATINGS[f.id]; return r?.kar?.where === whereF || r?.adam?.where === whereF;
  });
  films.sort((a, b) => (jointPct(b.id) ?? -1) - (jointPct(a.id) ?? -1));

  document.getElementById("oceny-count").textContent = films.length + " filmów";
  document.getElementById("oceny-grid").innerHTML = films.length
    ? films.map(f => mCard(f, "ocena")).join("")
    : "<div class='empty'>Brak wyników.</div>";
}

// ── LISTA ──
function renderLista() {
  const films = Object.values(WATCHLIST);
  document.getElementById("lista-count").textContent = films.length + " filmów";
  document.getElementById("lista-grid").innerHTML = films.length
    ? films.map(f => mCard(f, "watchlist")).join("")
    : "<div class='empty'>Lista jest pusta — dodaj filmy przyciskiem powyżej.</div>";
}

/* ═══════════════════════════════════════════════
   ACTOR / DIRECTOR RANKINGS
═══════════════════════════════════════════════ */
function buildPersonRankings(role) {
  // role: "Aktor/ka" | "Reżyseria"
  const agg = {}; // name -> { karScores:[], adamScores:[], movies:Set }
  for (const [movieId, rating] of Object.entries(RATINGS)) {
    const film = MOVIES[movieId];
    const processScores = (who) => {
      for (const [name, score] of Object.entries(rating[who]?.actorScores || {})) {
        // Try to detect if it's director or actor - we tag director with 🎬 prefix in name internally
        // We can't tell role from score alone so show all under actors, directors separately using Firestore details
        if (!agg[name]) agg[name] = { karScores:[], adamScores:[], movies: new Set() };
        if (who === "kar")  agg[name].karScores.push(score);
        if (who === "adam") agg[name].adamScores.push(score);
        if (film) agg[name].movies.add(film.title);
      }
    };
    processScores("kar"); processScores("adam");
  }
  return Object.entries(agg)
    .map(([name, data]) => {
      const allScores = [...data.karScores, ...data.adamScores];
      const avg = allScores.length ? Math.round(allScores.reduce((a,b)=>a+b,0)/allScores.length*10)/10 : 0;
      const karAvg = data.karScores.length ? Math.round(data.karScores.reduce((a,b)=>a+b,0)/data.karScores.length*10)/10 : null;
      const adamAvg= data.adamScores.length ? Math.round(data.adamScores.reduce((a,b)=>a+b,0)/data.adamScores.length*10)/10 : null;
      return { name, avg, karAvg, adamAvg, movies: [...data.movies], count: allScores.length };
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.avg - a.avg);
}

function renderActorRankings(type) {
  const list = buildPersonRankings(type);
  if (!list.length) {
    document.getElementById("top-list").innerHTML = `<div class="empty">Brak ocen ${type === "actors" ? "aktorów" : "reżyserów"}. Oceń film i wypełnij sekcję obsady w formularzu.</div>`;
    return;
  }
  document.getElementById("top-list").innerHTML = list.map((p, i) => {
    const color = p.avg >= 4 ? "#4DAA70" : p.avg >= 3 ? "#E8952A" : "#D42B2B";
    return `<div class="actor-rank-row ${i === 0 ? "gold" : ""}">
      <div class="actor-rank-num" style="${i===0?"color:var(--gold)":i===1?"color:#909090":i===2?"color:#B07848":""}">${i+1}</div>
      <div class="actor-rank-info">
        <div class="actor-rank-name">${esc(p.name)}</div>
        <div class="actor-rank-meta">
          <span>${p.movies.slice(0,3).map(esc).join(", ")}${p.movies.length>3?" …":""}</span>
          <span>${p.count} ${p.count === 1 ? "ocena" : "ocen"}</span>
        </div>
      </div>
      <div class="actor-rank-score">
        ${p.karAvg  !== null ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:11px">💛 <b style="color:${color}">${p.karAvg}/5</b></span>`  : ""}
        ${p.adamAvg !== null ? `<span style="font-family:'IBM Plex Mono',monospace;font-size:11px">💙 <b style="color:${color}">${p.adamAvg}/5</b></span>` : ""}
        <div class="actor-avg" style="color:${color}">${p.avg}/5</div>
      </div>
    </div>`;
  }).join("");
}

// ── TOP ──
let curTopKey = "joint";
function renderTop(key) {
  curTopKey = key;
  if (key === "actors")    { renderActorRankings("actors");    return; }
  if (key === "directors") { renderActorRankings("directors"); return; }
  let films = Object.values(MOVIES).filter(f => {
    if (key === "kino") return RATINGS[f.id]?.kar?.where === "kino" || RATINGS[f.id]?.adam?.where === "kino";
    if (key === "dom")  return RATINGS[f.id]?.kar?.where === "dom"  || RATINGS[f.id]?.adam?.where === "dom";
    return !!RATINGS[f.id];
  });
  const getPct = f => key === "kar"  ? personScore(RATINGS[f.id]?.kar)
                    : key === "adam" ? personScore(RATINGS[f.id]?.adam)
                    : jointPct(f.id);
  films = films.filter(f => getPct(f) !== null).sort((a, b) => (getPct(b) ?? -1) - (getPct(a) ?? -1));
  document.getElementById("top-list").innerHTML = films.length
    ? films.map((f, i) => rankRow(f, i, key)).join("")
    : "<div class='empty'>Brak filmów.</div>";
}

// ── SAGI ──
function renderSagi() {
  const groups = {};
  for (const f of Object.values(MOVIES)) {
    if (!f.saga) continue;
    (groups[f.saga] = groups[f.saga] || []).push(f);
  }
  const names = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pl"));
  document.getElementById("sagi-list").innerHTML = names.length
    ? names.map(name => {
        const films = groups[name];
        const avgs  = films.map(f => jointPct(f.id)).filter(v => v !== null);
        const avg   = avgs.length ? Math.round(avgs.reduce((a,b)=>a+b,0)/avgs.length) : null;
        const lv    = avg !== null ? getLv(avg) : null;
        return `<div class="saga-group">
          <div class="saga-head">
            <span class="saga-name">${esc(name)}</span>
            <span class="saga-count">${films.length} ${films.length===1?"film":"filmów"}</span>
            ${lv ? `<span class="saga-avg">${pcSVG(lv.key,22)} <span style="color:${lv.color}">śr. ${avg}%</span></span>` : ""}
          </div>
          <div class="saga-body"><div class="movie-grid">${films.map(f=>mCard(f,"saga")).join("")}</div></div>
        </div>`;
      }).join("")
    : "<div class='empty'>Brak filmów z przypisaną sagą. Kliknij w film → Szczegóły → Przypisz sagę.</div>";
}

// ── LOSUJ ──
let lastDrawn = null;
function doLosuj() {
  const genre  = document.getElementById("losuj-genre")?.value  || "";
  const source = document.getElementById("losuj-source")?.value || "all";
  let pool = [];
  if (source === "lista")  pool = Object.values(WATCHLIST);
  else if (source === "rated") pool = Object.values(MOVIES).filter(f => RATINGS[f.id]);
  else pool = [...Object.values(MOVIES), ...Object.values(WATCHLIST)];
  // deduplicate by id
  const seen = new Set();
  pool = pool.filter(f => { if (seen.has(f.id)) return false; seen.add(f.id); return true; });
  if (genre) pool = pool.filter(f => f.genre === genre);
  if (!pool.length) {
    alert("Brak filmów w wybranej puli. Zmień gatunek lub źródło, ewentualnie dodaj filmy do bazy."); return;
  }

  const btn = document.getElementById("draw-btn");
  const res = document.getElementById("draw-res");
  if (!btn || !res) return;
  btn.disabled = true; res.style.display = "none";

  let i = 0, max = 16, picked = null;
  function tick() {
    picked = pool[Math.floor(Math.random() * pool.length)];
    const titleEl = document.getElementById("dr-title");
    const metaEl  = document.getElementById("dr-meta");
    const dpEl    = document.getElementById("dr-poster");
    if (!titleEl || !metaEl || !dpEl) { btn.disabled = false; return; }
    titleEl.textContent = picked.title;
    metaEl.textContent  = [picked.genre, picked.length ? picked.length+" min" : "", picked.year].filter(Boolean).join(" · ");
    dpEl.innerHTML = picked.poster
      ? `<img src="${esc(picked.poster)}" alt="" style="width:100%;height:100%;object-fit:cover">`
      : "🎬";
    i++;
    if (i < max) setTimeout(tick, 45 + i * 9);
    else {
      lastDrawn = picked;
      res.style.display = "block";
      btn.disabled = false;
      const rateBtn = document.getElementById("dr-rate-btn");
      const addBtn  = document.getElementById("dr-add-btn");
      if (rateBtn) rateBtn.onclick = () => {
        if (!lastDrawn) return;
        addToMovies(lastDrawn).then(() => openRating(lastDrawn.id));
      };
      if (addBtn) addBtn.onclick = () => {
        if (!lastDrawn) return;
        addToWatchlist(lastDrawn.id, lastDrawn);
      };
    }
  }
  tick();
}

// ── ZASADY ──
function renderZasady() {
  const ZL = document.getElementById("zasady-levels");
  if (!ZL || ZL.children.length) return; // już wyrenderowane
  ZL.innerHTML = LEVELS.map(l => `
    <div class="zasady-level-card" style="border-color:${l.color}44">
      ${pcSVG(l.key, 52)}
      <div class="zasady-level-name" style="color:${l.color}">${l.name}</div>
      <div class="zasady-level-pct"  style="color:${l.color}">${l.min}–${l.max}%</div>
      <div class="zasady-level-pts">${Math.round(l.min/100*50)}–${Math.round(l.max/100*50)} pkt / 50</div>
    </div>`).join("");

  const CATS_FULL = [
    {n:"Fabuła / Historia",     pts:["Nudna, przewidywalna","Trochę nudna, mało zaskakująca","Przyjemna, średnio wciągająca","Ciekawa, trzyma w napięciu","Niesamowita, nie można się oderwać"]},
    {n:"Oryginalność",          pts:["Przewidywalna, bez pomysłów","Lekko przewidywalna","Kilka ciekawych momentów","Oryginalna, zaskakujące zwroty akcji","Totalnie zaskakująca i unikalna"]},
    {n:"Plot twist",            pts:["Brak zaskoczeń","Kilka małych momentów zaskoczenia","Kilka ciekawych zwrotów akcji","Nieprzewidywalna w kluczowych momentach","Mistrzowskie zwroty akcji"]},
    {n:"Bohaterowie",           pts:["Płaskie, nudne","Trochę ciekawe, nieangażujące","Średnio ciekawi","Interesujący, dobrze rozwinięci","Pełne życia, zapadają w pamięć"]},
    {n:"Gra aktorska",          pts:["Sztuczna, brak emocji","Momentami wiarygodna, nierówna","Poprawna, naturalna w większości","Bardzo przekonująca, emocjonalnie spójna","Całkowicie autentyczna, pełna immersja"]},
    {n:"Emocje / Wrażenia",     pts:["Nic nie czułam/em","Odrobinę, ale niezbyt silnie","Średnio emocjonująca","Mocne wrażenia, wzruszająca","Całkowicie mnie poruszyła"]},
    {n:"Moralność / Przesłanie",pts:["Brak przesłania","Słabe, ledwo zauważalne","Umiarkowane, dające do myślenia","Wyraźne, inspirujące przesłanie","Głębokie, prowokuje do refleksji"]},
    {n:"Pamięć po obejrzeniu",  pts:["Chcę zapomnieć","Łatwe do zapomnienia","Kilka momentów w pamięci","Długo pozostanie w głowie","Niezapomniane, intensywne"]},
  ];
  document.getElementById("zasady-cats").innerHTML = CATS_FULL.map((c, i) => `
    <div class="zasady-cat">
      <div class="zasady-cat-head">
        <div class="zasady-cat-num">${i+1}</div>
        <div class="zasady-cat-title">${c.n}</div>
        <div class="zasady-cat-pts">1–5 pkt</div>
      </div>
      <div class="zasady-cat-body">
        ${c.pts.map((d, n) => `<div class="zasady-pt"><div class="zasady-pt-num">${n+1} pkt</div><div class="zasady-pt-desc">${d}</div></div>`).join("")}
      </div>
    </div>`).join("");

  document.getElementById("zasady-genre").innerHTML = Object.entries(GENRE_CATS).map(([g, cats]) => `
    <div class="genre-cat-card">
      <div class="genre-cat-name">${g}</div>
      <div class="genre-cat-cats">${cats.join(" · ")}</div>
    </div>`).join("");
}

/* ═══════════════════════════════════════════════
   RATING FORM
═══════════════════════════════════════════════ */
let rfState = {
  movieId: null, genre: null, person: "kar", where: "kino",
  watchDate: new Date().toISOString().slice(0,10),
  scores:       { kar: Array(10).fill(3), adam: Array(10).fill(3) },
  personWatched:{ kar: true, adam: true },   // false = nie widziała/ał jeszcze
  castList:     [],
};

async function openRating(movieId) {
  const film = MOVIES[movieId] || WATCHLIST[movieId];
  if (!film) return;
  const r     = RATINGS[movieId];
  const genre = film.genre || "";
  rfState = {
    movieId, genre,
    person:        "kar",
    where:         r?.kar?.where || r?.adam?.where || "kino",
    watchDate:     r?.kar?.watchDate || r?.adam?.watchDate || new Date().toISOString().slice(0,10),
    scores: {
      kar:  r?.kar?.cats  ? [...r.kar.cats]  : Array(10).fill(3),
      adam: r?.adam?.cats ? [...r.adam.cats] : Array(10).fill(3),
    },
    personWatched: {
      kar:  r?.kar?.watched  !== false,
      adam: r?.adam?.watched !== false,
    },
    castList: rfState._lastMovieId === movieId && rfState.castList?.length ? rfState.castList : [],
  };
  rfState._lastMovieId = movieId;
  document.getElementById("ratingTitle").textContent = "Oceń: " + film.title;
  renderRFBody(film, allCats(genre));
  document.getElementById("ratingDialog").showModal();
  // async: pobierz obsadę (spróbuj po tmdbId, jeśli brak — szukaj po tytule)
  if (!rfState.castList.length) {
    let tid = film.tmdbId || null;
    if (!tid && TMDB_KEY && !TMDB_KEY.startsWith("WSTAW")) {
      try {
        const sr = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&language=pl-PL&query=${encodeURIComponent(film.title)}`);
        const sd = await sr.json();
        tid = sd.results?.[0]?.id || null;
        if (tid && MOVIES[movieId]) updateDoc(doc(COLL.movies, movieId), { tmdbId: tid }).catch(()=>{});
      } catch(_e) {}
    }
    if (tid) {
      const castData = await getCast(movieId, tid);
      rfState.castList = Array.isArray(castData) ? castData : [];
    }
    rfState._lastMovieId = movieId;
    const sect = document.getElementById("cast-section");
    if (sect) sect.innerHTML = buildCastSection();
  }
}

/* ─── cast display (read-only, ze zdjęciami) ─── */
function buildCastSection() {
  const cast = rfState.castList;
  if (!cast.length) return '<div class="sr-hint">Ładowanie obsady z TMDB…</div>';
  return `<div class="cast-display">${cast.map(({name, role, photo, char}) => {
    const isDir = role === "director";
    const label = isDir ? "Reżyseria" : (char ? char.slice(0, 20) : "Aktor/ka");
    return `<div class="cast-person">
      ${photo
        ? `<img src="${esc(photo)}" class="cast-photo" alt="${esc(name)}"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        : ""}
      <div class="cast-avatar"${photo?" style='display:none'":""}>${isDir ? "🎬" : "🎭"}</div>
      <div class="cast-name">${esc(name)}</div>
      <div class="cast-role">${esc(label)}</div>
    </div>`;
  }).join("")}</div>`;
}

/* ─── renderRFBody ─── */
function renderRFBody(film, cats) {
  const { person, where, scores, movieId, personWatched, watchDate } = rfState;
  const sc   = scores[person];
  const seen = personWatched[person];

  // oblicz procenty tylko dla osób, które widziały
  function calcPct(p) {
    if (!personWatched[p]) return null;
    return Math.round(scores[p].reduce((a,b)=>a+b,0) / 50 * 100);
  }
  const kP  = calcPct("kar");
  const aP  = calcPct("adam");
  const valid = [kP, aP].filter(v => v !== null);
  const jP   = valid.length ? Math.round(valid.reduce((a,b)=>a+b,0)/valid.length) : 0;
  const lv   = getLv(jP);
  const klv  = kP !== null ? getLv(kP) : null;
  const alv  = aP !== null ? getLv(aP) : null;
  const r    = RATINGS[movieId];

  document.getElementById("ratingForm").innerHTML = `
    <div class="rf-hd">
      <div class="rf-poster">
        ${film.poster ? `<img src="${esc(film.poster)}" alt="">` : "🎬"}
      </div>
      <div>
        <div class="rf-movie-title">${esc(film.title)}</div>
        <div class="rf-movie-meta">${[film.genre, film.length ? film.length+" min" : "", film.year].filter(Boolean).join(" · ")}</div>
        <div class="rf-gnote">+2 kategorie gatunkowe: ${esc((cats[8]||"")+" · "+(cats[9]||""))}</div>
      </div>
    </div>

    <!-- Gdzie i kiedy -->
    <div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:14px;flex-wrap:wrap">
      <div>
        <div class="rf-section-label" style="margin-bottom:6px">Gdzie oglądaliśmy:</div>
        <div class="rf-where" style="margin-bottom:0">
          <button class="rf-where-btn ${where==="kino"?"active":""}" onclick="rfSetWhere('kino')">🎟️ Kino</button>
          <button class="rf-where-btn ${where==="dom"?"active":""}" onclick="rfSetWhere('dom')">🏠 Dom</button>
        </div>
      </div>
      <div>
        <div class="rf-section-label" style="margin-bottom:6px">Data obejrzenia:</div>
        <input type="date" id="rf-watch-date" value="${watchDate}"
          style="background:var(--card2);border:1px solid var(--brd);border-radius:7px;color:var(--ink);padding:7px 10px;font-size:13px;font-family:'IBM Plex Mono',monospace"
          onchange="rfState.watchDate=this.value">
      </div>
    </div>

    <!-- Zakładki osób + toggle nie widziałam/em -->
    <div class="rf-ptabs" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <button class="rf-ptab ${person==="kar"?"active":""} ${!personWatched.kar?"not-seen":""}"
        onclick="rfSetPerson('kar')">
        💛 Karolina${!personWatched.kar?" · nie widziała":""}
      </button>
      <button class="rf-ptab ${person==="adam"?"active":""} ${!personWatched.adam?"not-seen":""}"
        onclick="rfSetPerson('adam')">
        💙 Adam${!personWatched.adam?" · nie widział":""}
      </button>
    </div>
    <div style="margin-bottom:14px">
      <button class="rf-seen-toggle ${seen?"seen":"notseen"}"
        onclick="rfSetWatched('${person}', ${!seen})">
        ${seen
          ? `✓ ${person==="kar"?"Karolina widziała":"Adam widział"} · kliknij żeby cofnąć`
          : `${person==="kar"?"Karolina":"Adam"} nie widział/a jeszcze · kliknij żeby ocenić`}
      </button>
    </div>

    <!-- Kategorie (tylko jeśli osoba widziała) -->
    ${seen ? `<div class="cats-grid">
      ${cats.map((c, i) => `
        <div class="cat-card ${i >= 8 ? "genre" : ""}">
          <div class="cat-name">${esc(c)}${i>=8?'<span class="gtag"> · gatunkowa</span>':""}</div>
          <div class="cat-stars">${[1,2,3,4,5].map(n =>
            `<div class="star ${sc[i]>=n?"on":""}" onclick="rfSetStar(${i},${n})">${n}</div>`).join("")}
          </div>
        </div>`).join("")}
    </div>` : `<div class="rf-not-seen-info">
      Kategorie będą dostępne po obejrzeniu.<br>
      Zapisz teraz — oceny można uzupełnić później.
    </div>`}

    <!-- Obsada (read-only) -->
    <div style="margin-bottom:14px">
      <div class="rf-section-label" style="margin-bottom:8px">Obsada</div>
      <div id="cast-section">${buildCastSection()}</div>
    </div>

    <!-- Panel wynik -->
    <div class="rf-score-panel">
      <div class="rf-icon-area">
        ${valid.length ? pcSVG(lv.key, 54) : '<div style="font-size:36px">🎬</div>'}
        <div class="rf-big-pct" style="color:${valid.length?lv.color:"var(--dim)"}">
          ${valid.length ? jP+"%" : "–"}
        </div>
        <div class="rf-level-name" style="color:${valid.length?lv.color:"var(--dim)"}">
          ${valid.length ? lv.name : "Brak ocen"}
        </div>
      </div>
      <div class="rf-bars">
        <div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">Karolina vs Adam</div>
        <div class="rf-bar-row">
          <span class="rf-bar-label">💛 Karolina</span>
          ${kP !== null
            ? `<div class="rf-bar-bg"><div class="rf-bar-fill" style="width:${kP}%;background:${klv.color}"></div></div>
               <span class="rf-bar-pct" style="color:${klv.color}">${kP}%</span>`
            : `<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted)">nie widziała</span>`}
        </div>
        <div class="rf-bar-row">
          <span class="rf-bar-label">💙 Adam</span>
          ${aP !== null
            ? `<div class="rf-bar-bg"><div class="rf-bar-fill" style="width:${aP}%;background:${alv.color}"></div></div>
               <span class="rf-bar-pct" style="color:${alv.color}">${aP}%</span>`
            : `<span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted)">nie widział</span>`}
        </div>
        <div class="rf-where-summary">
          ${where==="kino"?"🎟️ Kino":"🏠 Dom"} · ${watchDate}
          ${valid.length < 2 ? " · ocena częściowa" : ""}
        </div>
      </div>
    </div>

    <!-- Notatki -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;margin-top:12px">
      <div>
        <div class="rf-section-label" style="margin-bottom:4px">Notatka Karoliny</div>
        <input id="note-kar-short" type="text" maxlength="80" placeholder="Krótka (na karcie)…"
          style="background:var(--card2);border:1px solid var(--brd);border-radius:6px;color:var(--ink);padding:7px 9px;font-size:12px;width:100%"
          value="${esc(r?.kar?.noteShort||"")}">
      </div>
      <div>
        <div class="rf-section-label" style="margin-bottom:4px">Notatka Adama</div>
        <input id="note-adam-short" type="text" maxlength="80" placeholder="Krótka (na karcie)…"
          style="background:var(--card2);border:1px solid var(--brd);border-radius:6px;color:var(--ink);padding:7px 9px;font-size:12px;width:100%"
          value="${esc(r?.adam?.noteShort||"")}">
      </div>
    </div>
    <!-- Saga -->
    <div style="margin-bottom:12px">
      <div class="rf-section-label" style="margin-bottom:4px">Saga / Uniwersum (opcjonalnie)</div>
      <input id="rf-saga" type="text" placeholder="np. Marvel, Star Wars, Diuna…"
        style="background:var(--card2);border:1px solid var(--brd);border-radius:6px;color:var(--ink);padding:7px 9px;font-size:12px;width:100%"
        value="${esc(film.saga||"")}">
    </div>
    <div class="dialog-actions">
      <button class="btn" onclick="document.getElementById('ratingDialog').close()">Anuluj</button>
      <button class="btn btn-primary" onclick="saveRating()">Zapisz</button>
    </div>`;
}

function rfRerender() {
  const f = MOVIES[rfState.movieId] || WATCHLIST[rfState.movieId];
  if (f) renderRFBody(f, allCats(rfState.genre));
}

window.rfSetStar    = (i, n) => { rfState.scores[rfState.person][i] = n; rfRerender(); };
window.rfSetPerson  = (p)    => { rfState.person = p; rfRerender(); };
window.rfSetWhere   = (w)    => { rfState.where  = w; rfRerender(); };
window.rfSetWatched = window.rfSetWatched || ((p,v) => { rfState.personWatched[p]=v; rfRerender(); });
window.rfSetWatched = (p, v) => { rfState.personWatched[p] = v; rfRerender(); };

async function saveRating() {
  const { movieId, where, scores, personWatched, watchDate } = rfState;
  const film = MOVIES[movieId] || WATCHLIST[movieId];
  if (!film) return;
  const noteKarShort  = document.getElementById("note-kar-short")?.value.trim()  || null;
  const noteAdamShort = document.getElementById("note-adam-short")?.value.trim() || null;
  const saga          = document.getElementById("rf-saga")?.value.trim() || null;
  const wd            = rfState.watchDate || new Date().toISOString().slice(0,10);

  await setDoc(doc(COLL.ratings, movieId), {
    kar:  { cats: scores.kar,  where, watchDate: wd, watched: personWatched.kar,  noteShort: noteKarShort  },
    adam: { cats: scores.adam, where, watchDate: wd, watched: personWatched.adam, noteShort: noteAdamShort },
  });
  if (saga !== null) {
    await updateDoc(doc(COLL.movies, movieId), { saga: saga || null }).catch(() =>
      setDoc(doc(COLL.movies, movieId), { ...film, saga: saga || null }));
  }
  if (WATCHLIST[movieId]) await addToMovies(film);
  document.getElementById("ratingDialog").close();
}
window.saveRating = saveRating;

/* ═══════════════════════════════════════════════
   FILM DETAIL MODAL
═══════════════════════════════════════════════ */
async function openDetail(id) {
  const film = MOVIES[id] || WATCHLIST[id];
  if (!film) return;
  const r   = RATINGS[id];
  const p   = jointPct(id);
  const lv  = p !== null ? getLv(p) : null;
  const kP  = r?.kar  ? personScore(r.kar)  : null;
  const aP  = r?.adam ? personScore(r.adam) : null;
  const cats = allCats(film.genre || "");

  let castHtml = "<div class='cast-list' style='color:var(--muted);font-style:italic'>Ładowanie obsady…</div>";
  document.getElementById("detailContent").innerHTML = buildDetailHTML(film, r, p, lv, kP, aP, cats, castHtml);
  document.getElementById("detailDialog").showModal();

  // pobierz obsadę asynchronicznie
  const castData = await getCast(id, film.tmdbId);
  const castEl   = document.getElementById("detail-cast");
  if (castEl && castData) {
    castEl.innerHTML =
      (castData.director ? `<b>Reżyseria:</b> ${esc(castData.director)}<br>` : "") +
      (castData.cast?.length ? `<b>Obsada:</b> ${castData.cast.map(esc).join(", ")}` : "Brak danych o obsadzie.");
  }
}
window.openDetail = openDetail;

function buildDetailHTML(film, r, p, lv, kP, aP, cats, castHtml) {
  return `
  <div class="detail-head">
    <div class="detail-poster">
      ${film.poster ? `<img src="${esc(film.poster)}" alt="">` : `<div style="aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;font-size:40px;color:var(--dim)">🎬</div>`}
    </div>
    <div class="detail-info">
      <h2>${esc(film.title)}</h2>
      <div class="detail-meta">
        ${film.year   ? `<b>${esc(film.year)}</b><br>` : ""}
        ${film.genre  ? `Gatunek: ${esc(film.genre)}<br>` : ""}
        ${film.length ? `Czas: ${film.length} min<br>` : ""}
        ${film.saga   ? `Saga: ${esc(film.saga)}<br>` : ""}
        ${r?.kar?.where ? `Oglądane w: ${r.kar.where === "kino" ? "🎟️ Kinie" : "🏠 Domu"}<br>` : ""}
        ${film.link ? `<a href="${esc(film.link)}" target="_blank" rel="noopener" style="color:var(--gold);font-size:11px">Więcej →</a>` : ""}
      </div>
      ${lv ? `<div class="detail-score">
        ${pcSVG(lv.key, 54)}
        <div>
          <div class="detail-avg" style="border-color:${lv.color};color:${lv.color}">${p}%</div>
          <div class="detail-level" style="color:${lv.color};margin-top:4px">${lv.name}</div>
        </div>
      </div>` : ""}
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
        ${kP !== null ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px">💛 Karolina: <b style="color:${getLv(kP).color}">${kP}%</b></div>` : ""}
        ${aP !== null ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:11px">💙 Adam: <b style="color:${getLv(aP).color}">${aP}%</b></div>` : ""}
      </div>
    </div>
  </div>
  ${r ? `<div class="detail-cats">
    ${cats.map((c, i) => {
      const ks = r?.kar?.cats?.[i]  ?? "–";
      const as = r?.adam?.cats?.[i] ?? "–";
      return `<div class="detail-cat">
        <div class="detail-cat-name">${esc(c)}</div>
        <div class="detail-cat-scores">
          ${ks !== "–" ? `<span>💛 ${ks}/5</span>` : ""}
          ${as !== "–" ? `<span>💙 ${as}/5</span>` : ""}
        </div>
      </div>`;
    }).join("")}
  </div>` : ""}
  ${r?.kar?.noteShort || r?.adam?.noteShort ? `<div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin-top:10px">
    <div style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:5px">Notatki</div>
    ${r?.kar?.noteShort  ? `<div class="note-k">💛 ${esc(r.kar.noteShort)}</div>`  : ""}
    ${r?.adam?.noteShort ? `<div class="note-a">💙 ${esc(r.adam.noteShort)}</div>` : ""}
  </div>` : ""}
  <div style="background:var(--card2);border-radius:8px;padding:10px 12px;margin-top:10px">
    <div class="cast-list" id="detail-cast">${castHtml}</div>
  </div>
  <div class="dialog-actions" style="margin-top:12px">
    <button class="btn btn-danger" onclick="deleteMovie('${esc(film.id)}');document.getElementById('detailDialog').close()">Usuń film</button>
    <button class="btn" onclick="openRating('${esc(film.id)}');document.getElementById('detailDialog').close()">${r ? "Edytuj ocenę" : "Oceń"}</button>
  </div>`;
}

/* ═══════════════════════════════════════════════
   FIREBASE CRUD
═══════════════════════════════════════════════ */
async function addToMovies(film) {
  await setDoc(doc(COLL.movies, film.id), film);
}
async function addToWatchlist(id, film) {
  const f = film || MOVIES[id];
  if (!f) return;
  if (WATCHLIST[id]) { alert("Ten film jest już na liście."); return; }
  if (RATINGS[id])   { alert("Ten film jest już oceniony."); return; }
  await setDoc(doc(COLL.watchlist, id), f);
  setView("lista");
}
window.addToWatchlist = addToWatchlist;
async function removeFromWatchlist(id) {
  await deleteDoc(doc(COLL.watchlist, id));
}
window.removeFromWatchlist = removeFromWatchlist;
async function deleteMovie(id) {
  if (!confirm("Usunąć film i wszystkie jego oceny?")) return;
  await deleteDoc(doc(COLL.movies, id)).catch(()=>{});
  await deleteDoc(doc(COLL.ratings, id)).catch(()=>{});
  await deleteDoc(doc(COLL.watchlist, id)).catch(()=>{});
}
window.deleteMovie = deleteMovie;

/* ═══════════════════════════════════════════════
   WYSZUKIWARKA TMDB
═══════════════════════════════════════════════ */
let searchMode = "watchlist"; // "watchlist" | "ocena"
function openSearch(mode) {
  searchMode = mode;
  document.getElementById("searchTitle").textContent =
    mode === "ocena" ? "Oceń film z bazy TMDB" : "Dodaj film do listy";
  document.getElementById("searchInput").value = "";
  document.getElementById("searchResults").innerHTML = "";
  document.getElementById("searchDialog").showModal();
  document.getElementById("searchInput").focus();
}
window.openSearch = openSearch;

document.getElementById("searchInput").addEventListener("input", e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (q.length < 2) { document.getElementById("searchResults").innerHTML = ""; return; }
  searchTimer = setTimeout(() => runSearch(q), 350);
});

async function runSearch(q) {
  const box = document.getElementById("searchResults");
  if (!TMDB_KEY || TMDB_KEY.startsWith("WSTAW")) {
    box.innerHTML = `<div class="sr-hint">Brak klucza TMDB w config.js.</div>`; return;
  }
  box.innerHTML = `<div class="sr-hint">Szukam…</div>`;
  const results = await tmdbSearch(q, "movie");
  if (!results.length) { box.innerHTML = `<div class="sr-hint">Brak wyników.</div>`; return; }
  box.innerHTML = results.map(res => {
    const title  = res.title || res.name;
    const year   = (res.release_date || "").slice(0, 4);
    const poster = res.poster_path ? TMDB_IMG + res.poster_path : null;
    return `<button type="button" class="sr-item" onclick="selectTmdb(${res.id})">
      ${poster ? `<img src="${poster}" alt="" onerror="this.style.display='none'">` : '<div class="sr-ph">🎬</div>'}
      <span>${esc(title)} ${year ? `<small style="color:var(--muted)">(${year})</small>` : ""}</span>
    </button>`;
  }).join("");
}

/* ═══════════════════════════════════════════════
   TMDB TRENDING
═══════════════════════════════════════════════ */
let _trendingCache = null;
let _trendingTime  = 0;
async function fetchTmdbTrending() {
  if (_trendingCache && Date.now() - _trendingTime < 5 * 60 * 1000) return _trendingCache;
  if (!TMDB_KEY || TMDB_KEY.startsWith("WSTAW")) return [];
  try {
    const r = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_KEY}&language=pl-PL`);
    const d = await r.json();
    _trendingCache = (d.results || []).slice(0, 10).map(res => ({
      id:     "t" + res.id,
      tmdbId: res.id,
      title:  res.title,
      poster: res.poster_path ? TMDB_IMG + res.poster_path : null,
      year:   (res.release_date || "").slice(0, 4) || null,
      genre:  tmdbGenre(res.genre_ids || []),
      link:   `https://www.themoviedb.org/movie/${res.id}`,
      length: null,
    }));
    _trendingTime = Date.now();
    return _trendingCache;
  } catch(e) { console.warn("TMDB trending error:", e); return []; }
}

async function selectTmdb(tmdbId) {
  document.getElementById("searchResults").innerHTML = `<div class="sr-hint">Pobieram szczegóły…</div>`;
  const det = await tmdbDetails(tmdbId);
  if (!det) { alert("Nie udało się pobrać szczegółów."); return; }

  const film = {
    id:      "t" + tmdbId,
    tmdbId:  tmdbId,
    title:   det.title || "?",
    poster:  det.poster_path ? TMDB_IMG + det.poster_path : null,
    year:    (det.release_date || "").slice(0, 4) || null,
    length:  det.runtime || null,
    genre:   tmdbGenre(det.genres?.map(g => g.id)),
    link:    `https://www.themoviedb.org/movie/${tmdbId}`,
    saga:    det.belongs_to_collection?.name || null,
  };

  document.getElementById("searchDialog").close();
  if (searchMode === "ocena") {
    await addToMovies(film);
    openRating(film.id);
  } else {
    await addToWatchlist(film.id, film);
  }
}
window.selectTmdb = selectTmdb;
window.doLosuj    = doLosuj;
window.openRating = openRating;
window.rfSetStar  = rfSetStar;
window.rfSetPerson= rfSetPerson;
window.rfSetWhere = rfSetWhere;

/* ═══════════════════════════════════════════════
   REPERTUAR Z data/films.json
═══════════════════════════════════════════════ */
function currentMonthFilms() {
  const now = new Date();
  const key = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  return DB_FILMS.months[key]?.films || {};
}
async function loadDbFilms() {
  try {
    const r = await fetch("data/films.json?v=" + Date.now());
    DB_FILMS = await r.json();
    if (DB_FILMS.updated) document.getElementById("seanse-count").textContent = "Dane z: " + DB_FILMS.updated;
    // Dodaj filmy z kina do MOVIES jeśli ich tam nie ma (tylko metadane, bez ocen)
    for (const f of Object.values(currentMonthFilms())) {
      if (!MOVIES[f.id]) await setDoc(doc(COLL.movies, f.id), { ...f, fromCinema: true }).catch(() => {});
    }
  } catch(e) {
    console.warn("data/films.json niedostępny:", e);
  }
}

/* ═══════════════════════════════════════════════
   ROUTING
═══════════════════════════════════════════════ */
const VIEWS = ["home","seanse","oceny","lista","top","sagi","losuj","zasady"];
function currentView() {
  const h = location.hash.replace("#", "");
  return VIEWS.includes(h) ? h : "home";
}
function setView(v) {
  location.hash = v === "home" ? "" : v;
}
window.setView = setView;

function applyView() {
  const v = currentView();
  for (const id of VIEWS) {
    const el = document.getElementById("v-" + id);
    if (el) el.classList.toggle("active", id === v);
  }
  document.querySelectorAll(".ntab").forEach(t =>
    t.classList.toggle("active", t.dataset.view === v));
  renderCurrentView();
}
function renderCurrentView() {
  const v = currentView();
  if (v === "home")    renderHome();
  else if (v === "seanse")  renderSeanse();
  else if (v === "oceny")   renderOceny();
  else if (v === "lista")   renderLista();
  else if (v === "top")     renderTop(curTopKey);
  else if (v === "sagi")    renderSagi();
  else if (v === "losuj")   {} // losuj doesn't auto-render
  else if (v === "zasady")  renderZasady();
}

window.addEventListener("hashchange", applyView);

// Nav clicks
document.getElementById("nav").addEventListener("click", e => {
  const btn = e.target.closest(".ntab");
  if (btn) setView(btn.dataset.view);
});

// Top tabs
document.querySelector(".top-tab-bar").addEventListener("click", e => {
  const btn = e.target.closest(".top-tab");
  if (!btn) return;
  document.querySelectorAll(".top-tab").forEach(t => t.classList.remove("active"));
  btn.classList.add("active");
  renderTop(btn.dataset.top);
});

// Seanse filters
["seanse-date","seanse-cinema"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", renderSeanse);
});
// Oceny filters
["oceny-filter-level","oceny-filter-where"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", renderOceny);
});

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
(async function init() {
  await loadDbFilms();
  applyView();
})();
