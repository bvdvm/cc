// series-logic.js — czysta logika ocen seriali (bez DOM i bez Firebase, testowalna w Node)

/* ───────── KATEGORIE ───────── */

// Tryb ogólny: 8 kategorii bazowych (+2 gatunkowe z app.js) = maks. 50 pkt
export const SERIES_BASE_CATS = [
  { n: "Fabuła i spójność", pts: [
    "Chaotyczna, pełna dziur logicznych",
    "Nierówna, część wątków urywa się bez wyjaśnienia",
    "Poprawna, momentami wciąga",
    "Spójna, dobrze poprowadzona przez cały serial",
    "Mistrzowsko poprowadzona — każdy wątek ma swoje miejsce" ] },
  { n: "Oryginalność", pts: [
    "Kalka znanych schematów",
    "Garść świeżych pomysłów",
    "Kilka ciekawych rozwiązań",
    "Wyraźnie własny styl, zaskakujące pomysły",
    "Zupełnie unikalny — nie ma drugiego takiego" ] },
  { n: "Bohaterowie i ich rozwój", pts: [
    "Płascy, bez zmian i bez wyrazu",
    "Rozwój ledwo zauważalny",
    "Ciekawi, rozwój tylko momentami",
    "Wyraziści, widać ich drogę",
    "Niezapomniani — ich przemiana to serce serialu" ] },
  { n: "Gra aktorska", pts: [
    "Sztuczna gra, brak emocji",
    "Momentami wiarygodna, ale nierówna",
    "Poprawna, naturalna w większości scen",
    "Bardzo przekonująca, emocjonalnie spójna",
    "Całkowicie autentyczna, pełna immersja" ] },
  { n: "Tempo", pts: [
    "Dłuży się, pełno wypełniaczy",
    "Sporo zbędnych odcinków",
    "Miejscami zwalnia",
    "Dobrze wyważone",
    "Idealne — żaden odcinek nie jest zbędny" ] },
  { n: "Emocje i wciągnięcie", pts: [
    "Obojętność, trudno dokończyć",
    "Ogląda się bez zaangażowania",
    "Wciąga od czasu do czasu",
    "Mocno angażuje, „jeszcze jeden odcinek”",
    "Nie sposób się oderwać, pochłonięty w kilka dni" ] },
  { n: "Wrażenia wizualne i muzyka", pts: [
    "Tandetna realizacja, muzyka do zapomnienia",
    "Przeciętna oprawa, nic szczególnego",
    "Poprawna, kilka ładnych scen",
    "Piękne zdjęcia i dobra muzyka",
    "Mistrzowska — obraz i ścieżka dźwiękowa zostają w głowie" ] },
  { n: "Finał i spełnienie obietnicy", pts: [
    "Rozczarowujący, zawodzi",
    "Pośpieszony lub urwany",
    "Poprawny, zamyka najważniejsze wątki",
    "Satysfakcjonujące zwieńczenie historii",
    "Idealne zakończenie, lepsze niż oczekiwano" ] },
];

// Tryb sezonowy i odcinkowy (ocena sezonu): 7 kategorii = maks. 35 pkt
export const SERIES_SEASON_CATS = [
  { n: "Fabuła sezonu", pts: [
    "Chaotyczna, nic się nie klei",
    "Nierówna, kilka dobrych momentów",
    "Poprawna, prowadzi do celu",
    "Ciekawa, trzyma w napięciu przez cały sezon",
    "Wyśmienita — sezon jak jedna wielka opowieść" ] },
  { n: "Bohaterowie i rozwój", pts: [
    "Bez zmian, bez wyrazu",
    "Rozwój ledwo zauważalny",
    "Widać zmianę, ale bywa wymuszona",
    "Wyraźna, wiarygodna przemiana",
    "Przemiana postaci to największa siła sezonu" ] },
  { n: "Gra aktorska", pts: [
    "Sztuczna, brak emocji",
    "Nierówna, momentami drewniana",
    "Poprawna i naturalna",
    "Bardzo przekonująca",
    "Autentyczna — aktorzy porywają" ] },
  { n: "Tempo", pts: [
    "Dłuży się, wypełniacze",
    "Kilka zbędnych odcinków",
    "Miejscami zwalnia",
    "Dobrze wyważone",
    "Idealne — żaden odcinek nie jest zbędny" ] },
  { n: "Emocje", pts: [
    "Obojętność",
    "Odrobina emocji",
    "Średnio poruszający",
    "Mocne wrażenia, trudno się oderwać",
    "Całkowicie pochłania i porusza" ] },
  { n: "Wrażenia wizualne i muzyka", pts: [
    "Tandetna realizacja",
    "Przeciętna oprawa",
    "Kilka ładnych kadrów",
    "Piękne zdjęcia, efekty robią wrażenie",
    "Mistrzowska oprawa wizualna i muzyczna" ] },
  { n: "Finał sezonu / cliffhanger", pts: [
    "Rozczarowujący, zawodzi",
    "Pośpieszony lub urwany",
    "Poprawny, zamyka główne wątki",
    "Satysfakcjonujący, zostawia ciekawy haczyk",
    "Wstrząsający — czekanie na kolejny sezon nie do zniesienia" ] },
];

// Gwiazdki odcinka: 0–5
export const EPISODE_LABELS = [
  "Tragiczny — szkoda czasu",
  "Słaby",
  "Przeciętny",
  "Dobry",
  "Bardzo dobry",
  "Arcydzieło",
];

export const STATUS_LABELS = {
  todo: "Do obejrzenia",
  watching: "W trakcie",
  done: "Obejrzany",
  dropped: "Porzucony",
  skip: "Nie oglądał(a)",
};

/* ───────── GATUNKI TV (TMDB) → gatunki z kategoriami ───────── */
const TV_GENRE = {
  10759: "Akcja", 16: "Animacja", 35: "Komedia", 80: "Thriller", 99: "Dokumentalny",
  18: "Dramat", 9648: "Thriller", 10765: "Sci-Fi", 10768: "Dramat", 10766: "Dramat",
};
export function tvGenre(ids) {
  for (const id of ids || []) if (TV_GENRE[id]) return TV_GENRE[id];
  return "";
}

/* ───────── WYNIKI ───────── */
const validCat = v => typeof v === "number" && v >= 1 && v <= 5;

// Mapa kategorii { "0": 4, "3": 5 } → % (średnia z ocenionych kategorii / 5).
// Przy komplecie kategorii to dokładnie suma / maks. Ocena częściowa liczy się z tego, co już wpisano.
export function catsPct(map) {
  const vals = Object.values(map || {}).filter(validCat);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / (vals.length * 5) * 100);
}
export function catsFilled(map) {
  return Object.values(map || {}).filter(validCat).length;
}

// Gwiazdki odcinków sezonu { "1": 4, "2": 0 } → % (0–5 gwiazdek)
export function episodePct(epMap, episodesCount) {
  const vals = Object.entries(epMap || {})
    .filter(([e, v]) => typeof v === "number" && v >= 0 && v <= 5 && (!episodesCount || +e <= episodesCount))
    .map(([, v]) => v);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / (vals.length * 5) * 100);
}

// Wynik pojedynczego sezonu zależnie od trybu osoby
export function seasonPct(person, n, episodesCount) {
  if (!person) return null;
  const mode = person.mode || "overall";
  const key = String(n);
  const cp = catsPct(person.seasons && person.seasons[key] && person.seasons[key].cats);
  if (mode === "season") return cp;
  if (mode === "episode") {
    const ep = episodePct(person.episodes && person.episodes[key], episodesCount);
    if (ep !== null && cp !== null) return Math.round((ep + cp) / 2); // 50% odcinki + 50% kategorie
    return ep !== null ? ep : cp;
  }
  return null;
}

// Wynik serialu jednej osoby
export function seriesPct(person, seasons) {
  if (!person || person.notSeen) return null;
  const mode = person.mode || "overall";
  if (mode === "overall") return catsPct(person.overall && person.overall.cats);
  const vals = (seasons || []).map(s => seasonPct(person, s.n, s.episodes)).filter(v => v !== null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// Wynik wspólny: tylko osoby, które oglądały i mają wynik
export function jointSeriesPct(rating, seasons) {
  const vals = ["kar", "adam"].map(w => seriesPct(rating && rating[w], seasons)).filter(v => v !== null);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/* ───────── POSTĘP I STATUS ───────── */
function watchedInSeason(person, s) {
  const arr = (person && person.watched && person.watched[String(s.n)]) || [];
  return new Set(arr.filter(e => Number.isInteger(e) && e >= 1 && e <= s.episodes));
}
export function seasonWatched(person, s) { return watchedInSeason(person, s).size; }
export function isEpWatched(person, n, e) {
  const arr = (person && person.watched && person.watched[String(n)]) || [];
  return arr.includes(e);
}

export function progress(person, seasons) {
  let total = 0, watched = 0;
  for (const s of seasons || []) { total += s.episodes; watched += watchedInSeason(person, s).size; }
  return { watched, total, pct: total ? Math.round(watched / total * 100) : 0 };
}

export function statusOf(person, seasons) {
  if (person && person.notSeen) return "skip";
  const pr = progress(person, seasons);
  if (pr.total && pr.watched >= pr.total) return "done";
  if (person && person.dropped) return "dropped";
  if (pr.watched > 0) return "watching";
  return "todo";
}

export function jointStatus(rating, seasons) {
  const sts = ["kar", "adam"].map(w => statusOf(rating && rating[w], seasons)).filter(s => s !== "skip");
  if (!sts.length) return "todo";
  if (sts.every(s => s === "done")) return "done";
  if (sts.every(s => s === "dropped")) return "dropped";
  if (sts.some(s => s !== "todo")) return "watching";
  return "todo";
}

/* ───────── MUTACJE (zmieniają obiekt osoby w miejscu) ───────── */
export function toggleEp(p, n, e) {
  p.watched = p.watched || {};
  const k = String(n);
  const set = new Set(p.watched[k] || []);
  if (set.has(e)) set.delete(e); else set.add(e);
  const arr = [...set].sort((a, b) => a - b);
  if (arr.length) p.watched[k] = arr; else delete p.watched[k];
}
export function setSeasonWatched(p, season, on) {
  p.watched = p.watched || {};
  const k = String(season.n);
  if (on) p.watched[k] = Array.from({ length: season.episodes }, (_, i) => i + 1);
  else delete p.watched[k];
}
export function setAllWatched(p, seasons, on) {
  for (const s of seasons || []) setSeasonWatched(p, s, on);
}
// Klik w tę samą wartość kasuje ocenę kategorii
export function setCat(map, i, v) {
  const k = String(i);
  if (map[k] === v) delete map[k]; else map[k] = v;
}
// Gwiazdki odcinka 0–5; klik w tę samą wartość kasuje; ocena odcinka oznacza go jako obejrzany
export function setEpisodeRating(p, n, e, v) {
  p.episodes = p.episodes || {};
  const k = String(n), ek = String(e);
  p.episodes[k] = p.episodes[k] || {};
  if (p.episodes[k][ek] === v) {
    delete p.episodes[k][ek];
    if (!Object.keys(p.episodes[k]).length) delete p.episodes[k];
    return;
  }
  p.episodes[k][ek] = v;
  p.watched = p.watched || {};
  const set = new Set(p.watched[k] || []);
  set.add(e);
  p.watched[k] = [...set].sort((a, b) => a - b);
}

// Statystyki do profilu
export function totalMinutes(person, series) {
  const pr = progress(person, series.seasons);
  return pr.watched * (series.runtime || 45);
}
