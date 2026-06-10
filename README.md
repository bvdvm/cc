# SEANS — tracker filmów Cinema City Poznań

Statyczna aplikacja na GitHub Pages: lista filmów granych w **Cinema City Poznań Plaza** i **Poznań Kinepolis** pogrupowana po miesiącach, z ocenami dla Karoliny i Adama, średnią, czasem reklam i najbliższymi pokazami.

## Jak to działa

```
GitHub Action (co tydzień + 1. dnia miesiąca)
   └─> scripts/fetch_repertoire.py
         └─> pobiera repertuar z nieoficjalnego API cinema-city.pl
         └─> dopisuje filmy do data/films.json (pogrupowane po miesiącach)
GitHub Pages
   └─> index.html czyta data/films.json
   └─> oceny / obejrzane / reklamy → localStorage przeglądarki
```

## Instalacja

1. Utwórz nowe **publiczne** repozytorium i wgraj wszystkie pliki z tego folderu
   (łącznie z ukrytym katalogiem `.github/`).
2. **Settings → Pages** → Source: `Deploy from a branch` → branch `main`, folder `/ (root)`.
3. **Settings → Actions → General** → Workflow permissions: zaznacz
   **Read and write permissions** (Action musi commitować `films.json`).
4. Wejdź w zakładkę **Actions** → workflow „Aktualizuj repertuar Cinema City" →
   **Run workflow** — pierwsze ręczne uruchomienie zaciągnie aktualny repertuar.
5. Strona będzie dostępna pod `https://<twoj-login>.github.io/<nazwa-repo>/`.

## Ważne ograniczenia

- **API Cinema City zwraca tylko przyszłe seanse.** Miesiące sprzed pierwszego
  uruchomienia (np. styczeń–maj 2026) nie pobiorą się wstecz. Możesz je
  uzupełnić ręcznie, edytując `data/films.json` — struktura wpisu:

  ```json
  "2026-01": { "films": { "moj-id-1": {
    "id": "moj-id-1", "title": "Tytuł", "poster": "https://...jpg",
    "link": null, "length": 120, "year": "2026",
    "cinemas": ["Poznań Plaza"], "firstSeen": "2026-01-10"
  }}}
  ```

- **Oceny żyją w localStorage** konkretnej przeglądarki. Do przenoszenia między
  urządzeniami służą przyciski *Eksportuj oceny* / *Importuj oceny*.
- API jest **nieoficjalne** — jeśli Cinema City zmieni endpointy, popraw adres
  `BASE` w `scripts/fetch_repertoire.py`. Aktualny adres podejrzysz na
  cinema-city.pl w DevTools → Network → filtr `film-events`.

## Test lokalny

```bash
python scripts/fetch_repertoire.py   # pobiera dane do data/films.json
python -m http.server 8000           # otwórz http://localhost:8000
```
