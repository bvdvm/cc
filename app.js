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
  movies:   collection(db, "kMovies"),
  ratings:  collection(db, "kRatings"),
  watchlist:collection(db, "kWatchlist"),
  details:  collection(db, "kDetails"),
  pools:    collection(db, "kPools"),     // własne pule do losowania
};

let MOVIES   = {};
let POOLS    = {}; // poolId -> { name, items: [{id,title,poster,genre,year}] }  // id → film
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
onSnapshot(COLL.pools, s => { POOLS={}; s.forEach(d=>POOLS[d.id]={id:d.id,...d.data()}); if(currentView()==="losuj") renderLosuj(); }, e=>console.warn("pools:",e));
let DETAILS = {};
onSnapshot(COLL.details, s => { s.forEach(d => DETAILS[d.id] = d.data()); if(currentView()==="rezyserzy") renderRezyserzy(); }, e=>console.warn("details:",e));

/* ═══════════════════════════════════════════════
   POPCORN / OCENY
═══════════════════════════════════════════════ */
const LEVELS = [
  { key:"matcha", name:"Matcha Popcorn",    min:0,  max:39,  c1:"#3D9E52", c2:"#2D8040", bc:"#D42B2B", color:"#3D9E52" },
  { key:"kar",    name:"Karmelowy Popcorn", min:40, max:59,  c1:"#C87820", c2:"#9E5C10", bc:"#D42B2B", color:"#C87820" },
  { key:"sol",    name:"Solony Popcorn",    min:60, max:79,  c1:"#DDD5B8", c2:"#C4B896", bc:"#D42B2B", color:"#BDB09A" },
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
  "Gra aktorska", "Emocje / Wrażenia", "Moralność / Przesłanie", "Wrażenia wizualne"
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
  const sort = document.getElementById("sagi-sort")?.value || "avg-desc";
  // all films with saga (rated + unrated from MOVIES)
  const groups = {};
  for (const f of Object.values(MOVIES)) {
    if (!f.saga) continue;
    (groups[f.saga] = groups[f.saga] || []).push(f);
  }
  // build sorted names
  let names = Object.keys(groups);
  const avgOf = name => {
    const avgs = groups[name].map(f => jointPct(f.id)).filter(v=>v!==null);
    return avgs.length ? avgs.reduce((a,b)=>a+b,0)/avgs.length : -1;
  };
  if (sort==="avg-desc")   names.sort((a,b)=>avgOf(b)-avgOf(a));
  else if (sort==="avg-asc") names.sort((a,b)=>avgOf(a)-avgOf(b));
  else if (sort==="name")    names.sort((a,b)=>a.localeCompare(b,"pl"));
  else if (sort==="count-desc") names.sort((a,b)=>groups[b].length-groups[a].length);

  document.getElementById("sagi-list").innerHTML = names.length
    ? names.map(name => sagaGroupHTML(name, groups[name])).join("")
    : "<div class='empty'>Brak filmów z przypisaną sagą. Kliknij „+ Nowa saga" żeby zacząć.</div>";
}

function sagaGroupHTML(name, films) {
  const avgs = films.map(f => jointPct(f.id)).filter(v=>v!==null);
  const avg  = avgs.length ? Math.round(avgs.reduce((a,b)=>a+b,0)/avgs.length) : null;
  const lv   = avg !== null ? getLv(avg) : null;
  const rated = films.filter(f => RATINGS[f.id]).length;
  return `<div class="saga-group">
    <div class="saga-head">
      <span class="saga-name">${esc(name)}</span>
      <span class="saga-count">${films.length} ${films.length===1?"film":"filmów"} · ${rated} ocenione</span>
      ${lv ? `<span class="saga-avg">${pcSVG(lv.key,22)} <span style="color:${lv.color}">śr. ${avg}%</span></span>` : ""}
      <button class="btn" style="margin-left:auto;font-size:10px;padding:4px 10px"
        onclick="openSagaManager('${esc(name).replace(/'/g,"\\'")}')">Zarządzaj</button>
    </div>
    <div class="saga-body"><div class="movie-grid">${films.map(f=>{
      const mode = RATINGS[f.id] ? "saga" : "watchlist";
      return mCard(f, mode);
    }).join("")}</div></div>
  </div>`;
}

/* ─── Saga Manager ─── */
let _sagaName = null;
function openSagaManager(existingName) {
  _sagaName = existingName || null;
  renderSagaManager();
  document.getElementById("sagaDialog").showModal();
  document.getElementById("sagaDialogTitle").textContent = existingName ? `Saga: ${existingName}` : "Nowa saga";
}
window.openSagaManager = openSagaManager;

function renderSagaManager() {
  const box = document.getElementById("sagaManagerContent");
  if (!box) return;
  // Films in this saga
  const sagaFilms = _sagaName ? Object.values(MOVIES).filter(f=>f.saga===_sagaName) : [];
  box.innerHTML = `
    ${!_sagaName ? `<div style="margin-bottom:14px">
      <div class="rf-section-label" style="margin-bottom:6px">Nazwa sagi</div>
      <input id="sm-name" type="text" class="search-input" placeholder="np. Marvel, Diuna, Star Wars…">
    </div>` : ""}
    ${_sagaName ? `
    <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">
      Filmy w sadze: ${sagaFilms.length}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:200px;overflow-y:auto;margin-bottom:14px">
      ${sagaFilms.map(f=>`<div style="position:relative;background:var(--card2);border-radius:8px;overflow:hidden">
        <div style="aspect-ratio:2/3;display:flex;align-items:center;justify-content:center">
          ${f.poster?`<img src="${esc(f.poster)}" style="width:100%;height:100%;object-fit:cover">`:"🎬"}
        </div>
        <div style="padding:5px 6px;font-size:9.5px;font-weight:700;color:var(--ink);line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(f.title)}</div>
        <button onclick="sagaRemoveFilm('${esc(f.id)}')"
          style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.78);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer">✕</button>
      </div>`).join("")}
      ${sagaFilms.length===0?'<div style="grid-column:1/-1;color:var(--muted);font-size:12px;font-style:italic">Brak filmów</div>':""}
    </div>` : ""}
    <div class="rf-section-label" style="margin-bottom:6px">Dodaj film do sagi</div>
    <input type="text" id="sm-search" class="search-input" placeholder="Wyszukaj film w TMDB…" autocomplete="off" oninput="smSearch(this.value)">
    <div id="sm-results" class="search-results" style="max-height:200px"></div>
    <div class="dialog-actions" style="margin-top:12px">
      <button class="btn" onclick="document.getElementById('sagaDialog').close()">Zamknij</button>
      ${!_sagaName ? `<button class="btn btn-primary" onclick="sagaCreate()">Utwórz sagę</button>` : ""}
      ${_sagaName ? `<button class="btn btn-danger" onclick="sagaDelete()">Usuń sagę</button>` : ""}
    </div>`;
}

let _smTimer = null;
function smSearch(q) {
  clearTimeout(_smTimer);
  const box = document.getElementById("sm-results"); if(!box) return;
  if (q.length < 2) { box.innerHTML=""; return; }
  box.innerHTML = '<div class="sr-hint">Szukam…</div>';
  _smTimer = setTimeout(async () => {
    const results = await tmdbSearch(q, "movie");
    if (!results.length) { box.innerHTML='<div class="sr-hint">Brak wyników.</div>'; return; }
    box.innerHTML = results.slice(0,6).map(res => {
      const f = {
        id:"t"+res.id, tmdbId:res.id, title:res.title,
        poster: res.poster_path ? TMDB_IMG+res.poster_path : null,
        year: (res.release_date||"").slice(0,4),
        genre: tmdbGenre(res.genre_ids||[]),
      };
      const fj = JSON.stringify(f).replace(/"/g,"&quot;");
      return `<button type="button" class="sr-item" onclick="sagaAddFilm(JSON.parse(this.dataset.f))" data-f="${fj}">
        ${res.poster_path?`<img src="${TMDB_IMG_SM+res.poster_path}" alt="">` : '<div class="sr-ph">🎬</div>'}
        <span>${esc(res.title)} ${res.release_date?`<small>(${res.release_date.slice(0,4)})</small>`:""}</span>
      </button>`;
    }).join("");
  }, 350);
}
window.smSearch = smSearch;

async function sagaCreate() {
  const nameEl = document.getElementById("sm-name");
  const name = nameEl?.value.trim();
  if (!name) { alert("Podaj nazwę sagi."); return; }
  _sagaName = name;
  document.getElementById("sagaDialogTitle").textContent = `Saga: ${name}`;
  renderSagaManager();
  renderSagi();
}
window.sagaCreate = sagaCreate;

async function sagaAddFilm(film) {
  const name = _sagaName;
  if (!name) { alert("Najpierw utwórz lub wybierz sagę."); return; }
  film.saga = name;
  await setDoc(doc(COLL.movies, film.id), film);
  renderSagaManager();
}
window.sagaAddFilm = sagaAddFilm;

async function sagaRemoveFilm(id) {
  await updateDoc(doc(COLL.movies, id), { saga: null }).catch(()=>{});
  renderSagaManager();
}
window.sagaRemoveFilm = sagaRemoveFilm;

async function sagaDelete() {
  if (!confirm(`Usunąć sagę "${_sagaName}"? Filmy pozostaną w bazie, ale stracą przypisanie.`)) return;
  const films = Object.values(MOVIES).filter(f=>f.saga===_sagaName);
  for (const f of films) await updateDoc(doc(COLL.movies, f.id), { saga: null }).catch(()=>{});
  document.getElementById("sagaDialog").close();
  renderSagi();
}
window.sagaDelete = sagaDelete;

/* ═══════════════════════════════════════════════
   REŻYSERZY
═══════════════════════════════════════════════ */
function renderRezyserzy() {
  const sort = document.getElementById("rez-sort")?.value || "avg-desc";
  const groups = {};  // directorName -> { films:[], photo }
  for (const [movieId, detail] of Object.entries(DETAILS)) {
    const film = MOVIES[movieId]; if (!film) continue;
    const dir = (detail.people||[]).find(p=>p.role==="director");
    if (!dir) continue;
    if (!groups[dir.name]) groups[dir.name] = { films:[], photo: dir.photo||null };
    if (!groups[dir.name].films.find(f=>f.id===movieId)) groups[dir.name].films.push(film);
  }
  const avgOf = name => {
    const avgs = groups[name].films.map(f=>jointPct(f.id)).filter(v=>v!==null);
    return avgs.length ? avgs.reduce((a,b)=>a+b,0)/avgs.length : -1;
  };
  let names = Object.keys(groups);
  if (sort==="avg-desc")    names.sort((a,b)=>avgOf(b)-avgOf(a));
  else if (sort==="avg-asc") names.sort((a,b)=>avgOf(a)-avgOf(b));
  else if (sort==="name")    names.sort((a,b)=>a.localeCompare(b,"pl"));
  else if (sort==="count-desc") names.sort((a,b)=>groups[b].films.length-groups[a].films.length);

  document.getElementById("rez-list").innerHTML = names.length
    ? names.map(name => {
        const { films, photo } = groups[name];
        const avgs = films.map(f=>jointPct(f.id)).filter(v=>v!==null);
        const avg  = avgs.length ? Math.round(avgs.reduce((a,b)=>a+b,0)/avgs.length) : null;
        const lv   = avg!==null ? getLv(avg) : null;
        return `<div class="saga-group">
          <div class="saga-head">
            ${photo
              ? `<img src="${esc(photo)}" class="cast-photo" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0">`
              : `<div style="width:44px;height:44px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🎬</div>`}
            <span class="saga-name">${esc(name)}</span>
            <span class="saga-count">${films.length} ${films.length===1?"film":"filmów"}</span>
            ${lv ? `<span class="saga-avg">${pcSVG(lv.key,22)} <span style="color:${lv.color}">śr. ${avg}%</span></span>` : ""}
          </div>
          <div class="saga-body"><div class="movie-grid">${films.map(f=>mCard(f, RATINGS[f.id]?"saga":"watchlist")).join("")}</div></div>
        </div>`;
      }).join("")
    : "<div class='empty'>Brak danych o reżyserach. Kliknij w oceniony film → Szczegóły żeby załadować obsadę.</div>";
}

/* ═══════════════════════════════════════════════
   PROFILE STATS
═══════════════════════════════════════════════ */
function buildProfileStats(who) {
  const rated = Object.entries(RATINGS);
  const myRatings = rated.filter(([id, r]) => r[who]?.watched !== false && r[who]?.cats?.length);
  if (!myRatings.length) return null;

  const pct = ([id, r]) => personScore(r[who]);
  const scores = myRatings.map(pct).filter(v=>v!==null);
  const avg = scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : 0;

  // Genre breakdown
  const genreAvg = {};
  for (const [id, r] of myRatings) {
    const f = MOVIES[id]; if (!f?.genre) continue;
    const p = personScore(r[who]); if (p===null) continue;
    if (!genreAvg[f.genre]) genreAvg[f.genre] = [];
    genreAvg[f.genre].push(p);
  }
  const genreStats = Object.entries(genreAvg).map(([g,arr])=>({
    genre:g, avg: Math.round(arr.reduce((a,b)=>a+b,0)/arr.length), count:arr.length
  })).sort((a,b)=>b.avg-a.avg);
  const favGenre = genreStats[0] || null;

  // Top / Bottom 5
  const sorted = myRatings.sort((a,b)=>(pct(b)||0)-(pct(a)||0));
  const top5  = sorted.slice(0,5).map(([id])=>({film:MOVIES[id], p:personScore(RATINGS[id][who])}));
  const bot5  = sorted.slice(-5).reverse().map(([id])=>({film:MOVIES[id], p:personScore(RATINGS[id][who])}));

  // Distribution
  const dist = { matcha:0, kar:0, sol:0, boski:0 };
  for (const s of scores) dist[getLv(s).key]++;

  // Total watch time
  const totalMin = myRatings.reduce((sum,[id])=>{
    const f = MOVIES[id]; return sum + (f?.length || 0);
  }, 0);

  // Cinema vs home
  const cineCount = myRatings.filter(([id,r])=>r[who]?.where==="kino").length;
  const homeCount = myRatings.filter(([id,r])=>r[who]?.where==="dom").length;

  // Agree / Disagree with partner
  const partner = who==="kar"?"adam":"kar";
  const both = rated.filter(([id,r])=>r[who]?.watched!==false&&r[partner]?.watched!==false&&r[who]?.cats&&r[partner]?.cats);
  let maxAgree=null,maxDis=null,maxAgreeDiff=999,maxDisDiff=0;
  for (const [id,r] of both) {
    const mp = personScore(r[who]), pp = personScore(r[partner]);
    if (mp===null||pp===null) continue;
    const diff = Math.abs(mp-pp);
    if (diff < maxAgreeDiff) { maxAgreeDiff=diff; maxAgree={film:MOVIES[id],diff,myP:mp,pP:pp}; }
    if (diff > maxDisDiff)   { maxDisDiff=diff;   maxDis  ={film:MOVIES[id],diff,myP:mp,pP:pp}; }
  }

  return { total:myRatings.length, avg, scores, genreStats, favGenre, top5, bot5,
           dist, totalMin, cineCount, homeCount, maxAgree, maxDis };
}

function renderProfile(who) {
  const isKar = who === "kar";
  const name  = isKar ? "Karolina" : "Adam";
  const photo = isKar ? "karolina.jpg" : "adam.jpg";
  const heart = isKar ? "💛" : "💙";
  const partner = isKar ? "Adam" : "Karolina";
  const el    = document.getElementById(`profile-${who}-content`);
  if (!el) return;

  const st = buildProfileStats(who);
  if (!st) {
    el.innerHTML = `<div class="phead"><div><h1>${heart} ${name}</h1></div></div>
      <div class="content"><div class="empty">Brak ocen — zacznij oceniać filmy!</div></div>`;
    return;
  }
  const { total, avg, genreStats, favGenre, top5, bot5, dist, totalMin, cineCount, homeCount, maxAgree, maxDis } = st;
  const avgLv = getLv(avg);
  const hours = Math.floor(totalMin/60), mins = totalMin%60;

  el.innerHTML = `
  <!-- HERO profilu -->
  <div class="profile-hero">
    <div class="profile-photo-wrap">
      <img src="${photo}" class="profile-photo" alt="${name}" onerror="this.outerHTML='<div class=profile-avatar>${heart}</div>'">
    </div>
    <div class="profile-info">
      <div class="profile-name">${heart} ${name}</div>
      <div class="profile-sub">Kinoman · ${total} ocenionych filmów · śr. ${avg}%</div>
      <div class="profile-badge">
        ${pcSVG(avgLv.key, 38)}
        <div>
          <div class="profile-badge-pct" style="color:${avgLv.color}">${avg}%</div>
          <div class="profile-badge-lv"  style="color:${avgLv.color}">${avgLv.name}</div>
        </div>
      </div>
    </div>
    <!-- Quick stats -->
    <div class="profile-quick-stats">
      <div class="pqs-item"><div class="pqs-val">${total}</div><div class="pqs-lbl">Filmów oceniono</div></div>
      <div class="pqs-item"><div class="pqs-val">${hours}h ${mins}m</div><div class="pqs-lbl">Łączny czas</div></div>
      <div class="pqs-item"><div class="pqs-val">${cineCount}🎟️</div><div class="pqs-lbl">W kinie</div></div>
      <div class="pqs-item"><div class="pqs-val">${homeCount}🏠</div><div class="pqs-lbl">W domu</div></div>
      ${favGenre ? `<div class="pqs-item"><div class="pqs-val">${esc(favGenre.genre)}</div><div class="pqs-lbl">Ulubiony gatunek</div></div>` : ""}
    </div>
  </div>

  <div class="content" style="padding-top:20px">
    <!-- Score distribution -->
    <div class="section">
      <div class="sec-hd"><h2>Rozkład ocen</h2></div>
      <div class="profile-dist">
        ${LEVELS.map(l=>{
          const cnt = dist[l.key]||0;
          const pct2 = total ? Math.round(cnt/total*100) : 0;
          return `<div class="pdist-item">
            ${pcSVG(l.key,32)}
            <div class="pdist-bar-wrap">
              <div class="pdist-bar" style="width:${pct2}%;background:${l.color};min-width:${cnt?2:0}px"></div>
            </div>
            <span class="pdist-cnt" style="color:${l.color}">${cnt}</span>
          </div>`;
        }).join("")}
      </div>
    </div>

    <!-- Gatunek breakdown -->
    <div class="section">
      <div class="sec-hd"><h2>Średnie wg gatunku</h2></div>
      <div class="genre-bars">
        ${genreStats.map(({genre,avg:ga,count})=>{
          const lv2=getLv(ga);
          return `<div class="gbar-row">
            <div class="gbar-label">${esc(genre)}</div>
            <div class="gbar-track">
              <div class="gbar-fill" style="width:${ga}%;background:${lv2.color}"></div>
            </div>
            <div class="gbar-pct" style="color:${lv2.color}">${ga}%</div>
            <div class="gbar-cnt">${count} ${count===1?"film":"filmów"}</div>
          </div>`;
        }).join("")}
      </div>
    </div>

    <!-- Top 5 / Bottom 5 -->
    <div class="profile-cols">
      <div>
        <div class="sec-hd"><h2 style="color:var(--ok)">⭐ Top 5</h2></div>
        <div class="rank-list">${top5.map(({film,p},i)=>{
          if(!film) return "";
          const lv2=getLv(p);
          return `<div class="rank-row ${i===0?"gold":""}">
            <div class="rank-num">${i+1}</div>
            <div class="rank-poster">${film.poster?`<img src="${esc(film.poster)}" alt="">`:"🎬"}</div>
            <div class="rank-info"><span class="rank-title">${esc(film.title)}</span>
              <div class="rank-meta">${esc(film.genre||"")} ${film.year?`· ${film.year}`:""}</div>
            </div>
            <div class="rank-avg" style="border-color:${lv2.color};color:${lv2.color}">${p}%</div>
          </div>`;
        }).join("")}</div>
      </div>
      <div>
        <div class="sec-hd"><h2 style="color:var(--red)">🍿 Bottom 5</h2></div>
        <div class="rank-list">${bot5.map(({film,p},i)=>{
          if(!film) return "";
          const lv2=getLv(p);
          return `<div class="rank-row">
            <div class="rank-num">${i+1}</div>
            <div class="rank-poster">${film.poster?`<img src="${esc(film.poster)}" alt="">`:"🎬"}</div>
            <div class="rank-info"><span class="rank-title">${esc(film.title)}</span>
              <div class="rank-meta">${esc(film.genre||"")} ${film.year?`· ${film.year}`:""}</div>
            </div>
            <div class="rank-avg" style="border-color:${lv2.color};color:${lv2.color}">${p}%</div>
          </div>`;
        }).join("")}</div>
      </div>
    </div>

    <!-- Ciekawostki vs partner -->
    ${(maxAgree||maxDis) ? `<div class="section">
      <div class="sec-hd"><h2>Vs ${partner}</h2></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        ${maxAgree?.film ? `<div class="saga-group"><div class="saga-head">
          <span class="saga-name">🤝 Największa zgodność</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--ok)">różnica: ${maxAgree.diff}%</span>
        </div><div class="saga-body" style="display:flex;gap:12px;align-items:center">
          ${maxAgree.film.poster?`<img src="${esc(maxAgree.film.poster)}" style="width:42px;height:62px;object-fit:cover;border-radius:5px">`:""}
          <div><div style="font-weight:700;color:var(--ink)">${esc(maxAgree.film.title)}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);margin-top:3px">${isKar?"K":"A"}: ${maxAgree.myP}% · ${isKar?"A":"K"}: ${maxAgree.pP}%</div></div>
        </div></div>` : ""}
        ${maxDis?.film ? `<div class="saga-group"><div class="saga-head">
          <span class="saga-name">⚡ Największa różnica</span>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--red)">różnica: ${maxDis.diff}%</span>
        </div><div class="saga-body" style="display:flex;gap:12px;align-items:center">
          ${maxDis.film.poster?`<img src="${esc(maxDis.film.poster)}" style="width:42px;height:62px;object-fit:cover;border-radius:5px">`:""}
          <div><div style="font-weight:700;color:var(--ink)">${esc(maxDis.film.title)}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);margin-top:3px">${isKar?"K":"A"}: ${maxDis.myP}% · ${isKar?"A":"K"}: ${maxDis.pP}%</div></div>
        </div></div>` : ""}
      </div>
    </div>` : ""}
  </div>`;
}


// ── LOSUJ ──
let lastDrawn = null;
let _drawCache = { genre:"", data:[], ts:0 };

const GENRE_TO_TMDB_ID = {
  "Akcja":28,"Animacja":16,"Dokumentalny":99,"Dramat":18,"Fantasy":14,
  "Horror":27,"Komedia":35,"Romans":10749,"Sci-Fi":878,"Thriller":53,
};

async function fetchTmdbDrawPool(genre) {
  const now = Date.now();
  if (_drawCache.genre === genre && _drawCache.data.length && now - _drawCache.ts < 8*60*1000) {
    return _drawCache.data;
  }
  if (!TMDB_KEY || TMDB_KEY.startsWith("WSTAW")) return [];
  const gParam = genre && GENRE_TO_TMDB_ID[genre] ? `&with_genres=${GENRE_TO_TMDB_ID[genre]}` : "";
  let all = [];
  try {
    const reqs = [
      fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=pl-PL&page=1${gParam}`),
      fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_KEY}&language=pl-PL&page=2${gParam}`),
      fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}&language=pl-PL&page=1${gParam}`),
      fetch(`https://api.themoviedb.org/3/movie/top_rated?api_key=${TMDB_KEY}&language=pl-PL&page=2${gParam}`),
    ];
    const resps = await Promise.all(reqs);
    for (const r of resps) {
      if (!r.ok) continue;
      const d = await r.json();
      all.push(...(d.results||[]));
    }
  } catch(e) { console.warn("TMDB draw fetch error:", e); }
  const seen = new Set();
  const result = all
    .filter(f => { if(seen.has(f.id)) return false; seen.add(f.id); return true; })
    .map(f => ({
      id: "t"+f.id, tmdbId: f.id,
      title: f.title,
      poster: f.poster_path ? TMDB_IMG + f.poster_path : null,
      year:   (f.release_date||"").slice(0,4)||null,
      genre:  tmdbGenre(f.genre_ids||[]),
    }));
  _drawCache = { genre, data: result, ts: Date.now() };
  return result;
}

async function doLosuj() {
  const genre  = document.getElementById("losuj-genre")?.value  || "";
  const source = document.getElementById("losuj-source")?.value || "tmdb";
  const btn    = document.getElementById("draw-btn");
  const res    = document.getElementById("draw-res");
  if (!btn || !res) return;

  let pool = [];
  if (source === "lista") {
    pool = Object.values(WATCHLIST);
    if (genre) pool = pool.filter(f => f.genre === genre);
  } else if (source === "rated") {
    pool = Object.values(MOVIES).filter(f => RATINGS[f.id]);
    if (genre) pool = pool.filter(f => f.genre === genre);
  } else if (source.startsWith("pool:")) {
    const poolId = source.slice(5);
    pool = POOLS[poolId]?.items || [];
    if (genre) pool = pool.filter(f => f.genre === genre);
  } else {
    // "tmdb" — cała baza popularnych filmów z TMDB
    btn.disabled = true;
    btn.textContent = "Ładuję…";
    pool = await fetchTmdbDrawPool(genre);
    btn.textContent = "🎲 LOSUJ!";
  }

  if (!pool.length) {
    btn.disabled = false;
    alert("Brak filmów w wybranej puli. Zmień gatunek lub źródło."); return;
  }

  btn.disabled = true; res.style.display = "none";
  let i = 0, max = 18, picked = null;
  function tick() {
    picked = pool[Math.floor(Math.random()*pool.length)];
    const te = document.getElementById("dr-title");
    const me = document.getElementById("dr-meta");
    const de = document.getElementById("dr-poster");
    if (!te||!me||!de) { btn.disabled=false; return; }
    te.textContent = picked.title;
    me.textContent = [picked.genre, picked.length?picked.length+" min":"", picked.year].filter(Boolean).join(" · ");
    de.innerHTML   = picked.poster
      ? `<img src="${esc(picked.poster)}" alt="" style="width:100%;height:100%;object-fit:cover">` : "🎬";
    i++;
    if (i < max) setTimeout(tick, 40 + i*8);
    else {
      lastDrawn = picked; res.style.display = "block"; btn.disabled = false;
      const rb = document.getElementById("dr-rate-btn");
      const ab = document.getElementById("dr-add-btn");
      if (rb) rb.onclick = () => { if(lastDrawn) addToMovies(lastDrawn).then(()=>openRating(lastDrawn.id)); };
      if (ab) ab.onclick = () => { if(lastDrawn) addToWatchlist(lastDrawn.id, lastDrawn); };
    }
  }
  tick();
}
window.doLosuj = doLosuj;

/* ─── Pool CRUD ─── */
async function createPool(name) {
  if (!name?.trim()) return;
  const id = "p" + Date.now();
  await setDoc(doc(COLL.pools, id), { name: name.trim(), items: [] });
  return id;
}
async function poolAddFilm(poolId, film) {
  const pool = POOLS[poolId]; if (!pool) return;
  if (pool.items.some(x=>x.id===film.id)) { alert("Ten film jest już w tej puli."); return; }
  const item = { id:film.id, title:film.title, poster:film.poster||null, genre:film.genre||null, year:film.year||null };
  await updateDoc(doc(COLL.pools, poolId), { items:[...pool.items, item] });
}
async function poolRemoveFilm(poolId, filmId) {
  const pool = POOLS[poolId]; if (!pool) return;
  await updateDoc(doc(COLL.pools, poolId), { items: pool.items.filter(x=>x.id!==filmId) });
}
async function deletePool(poolId) {
  if (!confirm(`Usunąć pulę "${POOLS[poolId]?.name}"?`)) return;
  await deleteDoc(doc(COLL.pools, poolId));
}
window.createPool=createPool; window.poolRemoveFilm=poolRemoveFilm; window.deletePool=deletePool;

/* ─── Pool manager dialog ─── */
let _managerPoolId = null;
function openPoolManager(poolId) {
  _managerPoolId = poolId || null;
  renderPoolManager();
  document.getElementById("poolDialog").showModal();
}
window.openPoolManager = openPoolManager;

function renderPoolManager() {
  const dlg = document.getElementById("poolManagerContent");
  if (!dlg) return;
  const pools = Object.values(POOLS);
  if (!_managerPoolId && pools.length) _managerPoolId = pools[0].id;
  const cur = _managerPoolId ? POOLS[_managerPoolId] : null;
  dlg.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center">
      <select id="pm-pool-sel" onchange="_managerPoolId=this.value;renderPoolManager()"
        style="background:var(--card2);border:1px solid var(--brd);color:var(--ink);padding:7px 10px;border-radius:7px;font-size:13px;flex:1">
        ${pools.map(p=>`<option value="${esc(p.id)}" ${p.id===_managerPoolId?"selected":""}>${esc(p.name)} (${p.items?.length||0})</option>`).join("")}
        ${!pools.length?'<option disabled>Brak pul</option>':""}
      </select>
      <button class="btn" onclick="promptCreatePool()">+ Nowa pula</button>
      ${cur?`<button class="btn btn-danger" onclick="deletePool('${esc(_managerPoolId)}')">Usuń pulę</button>`:""}
    </div>
    ${cur ? `
    <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px">Filmy w puli: ${cur.items?.length||0}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:240px;overflow-y:auto;margin-bottom:12px">
      ${(cur.items||[]).map(f=>`<div style="background:var(--card2);border-radius:8px;overflow:hidden;position:relative">
        <div style="aspect-ratio:2/3;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--dim);background:var(--card2)">
          ${f.poster?`<img src="${esc(f.poster)}" alt="" style="width:100%;height:100%;object-fit:cover">`:"🎬"}
        </div>
        <div style="padding:5px 6px;font-size:10px;font-weight:700;color:var(--ink);line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(f.title)}</div>
        <button onclick="poolRemoveFilm('${esc(_managerPoolId)}','${esc(f.id)}')"
          style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.75);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer">✕</button>
      </div>`).join("")}
    </div>
    <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px">Dodaj film do puli</div>
    <input type="text" id="pm-search" class="search-input" placeholder="Wpisz tytuł…" autocomplete="off" oninput="pmSearch(this.value)" style="margin-bottom:6px">
    <div id="pm-results" class="search-results" style="max-height:180px"></div>
    ` : '<div class="empty">Utwórz pierwszą pulę przyciskiem powyżej.</div>'}
  `;
}

let _pmTimer = null;
function pmSearch(q) {
  clearTimeout(_pmTimer);
  const box = document.getElementById("pm-results"); if(!box) return;
  if (q.length < 2) { box.innerHTML=""; return; }
  box.innerHTML = '<div class="sr-hint">Szukam…</div>';
  _pmTimer = setTimeout(async () => {
    const results = await tmdbSearch(q, "movie");
    box.innerHTML = results.length ? results.slice(0,6).map(res => {
      const title = res.title; const year = (res.release_date||"").slice(0,4);
      const poster = res.poster_path ? TMDB_IMG_SM + res.poster_path : null;
      const film = { id:"t"+res.id, tmdbId:res.id, title, poster: res.poster_path?TMDB_IMG+res.poster_path:null, year, genre:tmdbGenre(res.genre_ids||[]) };
      const filmJSON = JSON.stringify(film).replace(/"/g,"&quot;");
      return `<button type="button" class="sr-item" onclick="poolAddFilm('${esc(_managerPoolId)}',JSON.parse(this.dataset.f));document.getElementById('pm-search').value='';document.getElementById('pm-results').innerHTML='';renderPoolManager()" data-f="${filmJSON}">
        ${poster?`<img src="${poster}" alt="">` : '<div class="sr-ph">🎬</div>'}
        <span>${esc(title)}${year?` <small>(${year})</small>`:""}</span>
      </button>`;
    }).join("") : '<div class="sr-hint">Brak wyników.</div>';
  }, 350);
}
window.pmSearch = pmSearch;

async function promptCreatePool() {
  const name = prompt("Nazwa nowej puli (np. Horrory na Halloween, Top Adama):");
  if (!name?.trim()) return;
  const id = await createPool(name);
  _managerPoolId = id;
  renderPoolManager();
}
window.promptCreatePool = promptCreatePool;

function renderLosuj() {
  const pools = Object.values(POOLS);
  const poolOpts = pools.map(p => `<option value="pool:${esc(p.id)}">${esc(p.name)} (${p.items?.length||0})</option>`).join("");
  const sel = document.getElementById("losuj-source");
  const curVal = sel?.value || "tmdb";
  if (sel) {
    sel.innerHTML = `
      <option value="tmdb">🎬 Cała baza TMDB (popularne)</option>
      <option value="lista">📋 Lista do obejrzenia</option>
      <option value="rated">⭐ Tylko ocenione</option>
      ${poolOpts ? `<optgroup label="Własne pule">${poolOpts}</optgroup>` : ""}
    `;
    // restore selection
    if ([...sel.options].some(o=>o.value===curVal)) sel.value = curVal;
  }
  const btn = document.getElementById("manage-pools-btn");
  if (btn) btn.textContent = `Zarządzaj pulami (${pools.length})`;
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
    {n:"Wrażenia wizualne",     pts:["Słaba realizacja, tandetne efekty — psuje odbiór","Przeciętna strona wizualna, nic szczególnego","Poprawna — kilka ładnych kadrów lub scen","Piękna realizacja, efekty robią wrażenie","Mistrzowskie wizualnie — każdy kadr jak dzieło sztuki"]},
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
const VIEWS = ["home","seanse","oceny","lista","top","sagi","rezyserzy","profil-kar","profil-adam","losuj","zasady"];
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
  else if (v === "sagi")        renderSagi();
  else if (v === "rezyserzy")    renderRezyserzy();
  else if (v === "profil-kar")   renderProfile("kar");
  else if (v === "profil-adam")  renderProfile("adam");
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
