// quick.js — jedno pole do dodawania: wpisz tytuł, wybierz film albo serial
export function initQuick(ctx) {
  const { esc, TMDB_KEY, toast, fetchFilm, rateMovie, addToList, getRatings, getMovies, getSeries } = ctx;
  const IMG = "https://image.tmdb.org/t/p/w92";
  const el = id => document.getElementById(id);
  const hasKey = () => TMDB_KEY && !String(TMDB_KEY).startsWith("WSTAW");
  let timer = null, seq = 0;

  function open() {
    const d = el("quickDialog"); if (!d) return;
    if (!d.open) d.showModal();
    el("quickInput").value = ""; el("quickResults").innerHTML = `<div class="sr-hint">Wpisz tytuł filmu lub serialu — wyszukamy w obu naraz.</div>`;
    el("quickInput").focus();
  }
  function close() { const d = el("quickDialog"); if (d && d.open) d.close(); }

  async function search(q) {
    const my = ++seq, box = el("quickResults");
    if (!hasKey()) { box.innerHTML = `<div class="sr-hint">Brak klucza TMDB w config.js.</div>`; return; }
    box.innerHTML = `<div class="sr-hint">Szukam…</div>`;
    try {
      const r = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&language=pl-PL&query=${encodeURIComponent(q)}`);
      const res = ((await r.json()).results || []).filter(x => x.media_type === "movie" || x.media_type === "tv").slice(0, 10);
      if (my !== seq) return;
      if (!res.length) { box.innerHTML = `<div class="sr-hint">Brak wyników.</div>`; return; }
      const R = getRatings() || {}, M = getMovies() || {}, S = getSeries() || {};
      box.innerHTML = res.map(x => {
        const isTv = x.media_type === "tv", title = x.title || x.name, year = (x.release_date || x.first_air_date || "").slice(0, 4);
        const fid = "t" + x.id, sid = "s" + x.id;
        let btns;
        if (isTv) btns = S[sid] ? `<button class="mc-btn" onclick="QA.openSeries('${sid}')">Otwórz serial</button>` : `<button class="mc-btn primary" onclick="QA.addSeries(${x.id})">+ Dodaj serial</button>`;
        else if (R[fid]) btns = `<button class="mc-btn" onclick="QA.detail('${fid}')">✓ Ocenione · szczegóły</button>`;
        else btns = `<button class="mc-btn primary" onclick="QA.rate(${x.id})">Oceń</button><button class="mc-btn" onclick="QA.list(${x.id})">+ Do listy</button>`;
        return `<div class="qa-row">
          ${x.poster_path ? `<img src="${IMG + x.poster_path}" alt="">` : `<div class="sr-ph">${isTv ? "📺" : "🎬"}</div>`}
          <div class="qa-info"><b>${esc(title)}</b><small>${isTv ? "📺 Serial" : "🎬 Film"}${year ? " · " + year : ""}</small></div>
          <div class="qa-btns">${btns}</div></div>`;
      }).join("");
    } catch (_e) { if (my === seq) box.innerHTML = `<div class="sr-hint">Błąd wyszukiwania.</div>`; }
  }

  window.QA = {
    open, close,
    async rate(id) { const f = await fetchFilm(id); if (!f) return toast("Nie udało się pobrać filmu"); close(); rateMovie(f); },
    async list(id) { const f = await fetchFilm(id); if (!f) return toast("Nie udało się pobrać filmu"); await addToList(f); close(); },
    async addSeries(id) { close(); await window.SX.pick(id); },
    openSeries(sid) { close(); location.hash = "seriale"; window.SX.open(sid); },
    detail(fid) { close(); window.openDetail(fid); },
  };
  el("quickInput")?.addEventListener("input", e => {
    clearTimeout(timer); const q = e.target.value.trim();
    if (q.length < 2) { seq++; el("quickResults").innerHTML = ""; return; }
    timer = setTimeout(() => search(q), 300);
  });
  // skrót: „/” otwiera okno (poza polami tekstowymi)
  document.addEventListener("keydown", e => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey) return;
    const t = e.target && e.target.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault(); open();
  });
  return { open };
}
