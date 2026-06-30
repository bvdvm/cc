# SEANS — tracker filmów Cinema City Poznań

Aplikacja na GitHub Pages (lub Cloudflare Pages — działa identycznie) z **w pełni współdzielonymi** danymi: Karolina i Adam widzą te same oceny, statusy „obejrzane", sagi, seriale i pule do losowania na każdym swoim urządzeniu, w czasie rzeczywistym. Współdzielenie zapewnia darmowa baza **Firebase Firestore** — bez tego (czyli na samym GitHub/Cloudflare Pages) każde urządzenie miałoby osobny, niezależny stan.

## Co jest w środku

| Plik / folder | Co robi |
|---|---|
| `index.html`, `style.css`, `app.js` | cała aplikacja (jeden front, bez frameworków) |
| `config.js` | **jedyny plik, który musisz edytować** — klucze Firebase i TMDB |
| `scripts/fetch_repertoire.py` + `.github/workflows/` | co tydzień pobiera repertuar Cinema City i zapisuje do `data/films.json` (bez zmian względem wcześniejszej wersji) |
| `firestore.rules` | reguły do wklejenia w konsoli Firebase |

Repertuar (co leci w kinie, kiedy) to dalej zwykły plik w repo, wspólny dla wszystkich. Nowość to **Twoje dane** (oceny, „obejrzane", ręcznie dodane filmy, sagi, seriale, pule do losowania) — to teraz żyje w Firebase, więc synchronizuje się automatycznie między Tobą a Karoliną.

---

## Krok 1 — Firebase (5–10 minut, bez karty kredytowej)

1. Wejdź na **[console.firebase.google.com](https://console.firebase.google.com)** i zaloguj się kontem Google.
2. **Dodaj projekt** → nazwij np. `seans-cc-poznan` → możesz wyłączyć Google Analytics (niepotrzebne) → **Utwórz projekt**.
3. Na stronie projektu kliknij ikonę **„</>"** (Web) żeby zarejestrować aplikację webową. Nazwa: dowolna, np. „seans-web". **Nie** zaznaczaj Firebase Hosting (zostajemy przy GitHub Pages).
4. Po rejestracji Firebase pokaże blok kodu z obiektem `firebaseConfig` — wygląda tak:
   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "seans-cc-poznan.firebaseapp.com",
     projectId: "seans-cc-poznan",
     storageBucket: "seans-cc-poznan.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123"
   };
   ```
   **Skopiuj te wartości** — zaraz wkleisz je do `config.js`.
5. W menu po lewej: **Build → Firestore Database → Create database**.
   - Tryb: wybierz **„Start in production mode"** (jeśli zapyta o tryb testowy — też zadziała, ale reguły z kroku 7 i tak go nadpiszą).
   - Lokalizacja: najbliższa Polsce, np. `eur3 (europe-west)`.
6. Po utworzeniu bazy przejdź do zakładki **Rules** (Reguły).
7. Wklej zawartość pliku `firestore.rules` z tej paczki, zastępując to, co tam jest domyślnie, i kliknij **Publish (Publikuj)**.

To wszystko po stronie Firebase — **nie** potrzebujesz Cloud Functions, planu Blaze ani karty kredytowej. Wszystko mieści się w darmowym planie Spark.

---

## Krok 2 — TMDB (wyszukiwanie filmów/seriali po nazwie + plakaty)

Filmweb nie udostępnia publicznego API, więc do wyszukiwania używamy **TMDB (The Movie Database)** — darmowe, legalne, z polskimi tytułami. Link do Filmwebu nadal możesz wkleić ręcznie w polu „Link" przy ręcznym dodawaniu filmu.

1. Załóż darmowe konto na **[themoviedb.org](https://www.themoviedb.org/signup)**.
2. Po zalogowaniu: **Ustawienia konta → API** (lub bezpośrednio [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)).
3. Kliknij **„Create"** / „Request an API key" → wybierz typ **„Developer"**.
4. Wypełnij krótki formularz (nazwa aplikacji: np. „Seans CC Poznań", URL: adres Twojego GitHub Pages, opis: prywatny tracker filmowy dla dwóch osób) → zaakceptuj regulamin.
5. Skopiuj **„API Key (v3 auth)"** — to długi ciąg liter i cyfr.

---

## Krok 3 — Uzupełnij `config.js`

Otwórz `config.js` (na GitHubie: kliknij plik → ołówek/Edit) i wklej swoje dane:

```js
export const firebaseConfig = {
  apiKey: "AIza...",                          // ← z kroku 1
  authDomain: "seans-cc-poznan.firebaseapp.com",
  projectId: "seans-cc-poznan",
  storageBucket: "seans-cc-poznan.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};

export const TMDB_KEY = "twoj_klucz_tmdb";    // ← z kroku 2
```

Zapisz (Commit changes). Strona przebuduje się automatycznie w ciągu chwili.

---

## Krok 4 — Wgranie i hosting

Działa identycznie na **GitHub Pages** i na **Cloudflare Pages** — Firebase jest tym, co zapewnia współdzielenie danych, więc wybór hostingu nie ma na to wpływu. Najprościej zostać przy GitHub Pages (jeśli już je skonfigurowałeś):

1. Wgraj **wszystkie pliki** z tej paczki do głównego katalogu repozytorium (struktura jak w tabeli wyżej — bez dodatkowego folderu nadrzędnego).
2. Settings → Pages → branch `main`, folder `/ (root)`.
3. Settings → Actions → General → Workflow permissions → **Read and write permissions** (dla automatycznego pobierania repertuaru).
4. Zakładka Actions → uruchom workflow „Aktualizuj repertuar Cinema City" ręcznie pierwszy raz.

*(Jeśli zamiast tego wolisz Cloudflare Pages: Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → wskaż to repo → Build command: brak (puste), Output directory: `/`. Reszta — Firebase i TMDB — działa bez zmian.)*

---

## Jak korzystać z nowych funkcji

- **Sagi**: na bilecie każdego filmu kliknij **„+ saga"** i wpisz nazwę (np. „Marvel", „Star Wars"). Jeśli dodajesz film przez wyszukiwarkę TMDB i należy on do serii filmowej w bazie TMDB (np. kolejna część Diuny), saga **wypełni się automatycznie**. Zakładka „Sagi" grupuje wszystko po tagach.
- **Top 10**: liczone osobno z ocen Karoliny i osobno z ocen Adama, tylko z obejrzanych filmów.
- **Seriale**: osobna zakładka z własnymi sekcjami Obejrzane / Do obejrzenia / Reszta i własnym Top 10. Dodawanie przez tę samą wyszukiwarkę TMDB (typ „serial").
- **Losuj**: każde z Was dodaje do swojej puli (max 30) filmy przez wyszukiwarkę TMDB — to niezależna lista od repertuaru kina, czysto na potrzeby losowania. Przycisk „Losuj!" wybiera losowo z wybranej puli (Twojej, Karoliny, albo obu naraz) z krótką animacją.
- **Dodawanie ręczne bez TMDB**: w każdym dialogu jest rozwijane „Nie znalazłeś filmu? Dodaj ręcznie" — przydatne dla bardzo nowych albo niszowych tytułów, których TMDB jeszcze nie ma.

---

## Bezpieczeństwo i koszty

- Reguły Firestore w tej wersji są **otwarte** (każdy ze znajomością adresu projektu mógłby technicznie zapisać dane) — dla prywatnej apki dwóch osób to rozsądny kompromis prostoty. Jeśli kiedyś zechcesz to zaostrzyć, dopisz Firebase Authentication (np. logowanie anonimowe + wspólny PIN sprawdzany w regule) — daj znać, pomogę to dograć.
- Darmowy plan Firebase (Spark) obejmuje 50 000 odczytów i 20 000 zapisów dziennie — dla dwóch osób oceniających filmy to absolutny margines bezpieczeństwa, nie powinniście nigdy się zbliżyć do limitu.
- Klucz TMDB w `config.js` jest technicznie widoczny w kodzie strony (tak działają aplikacje przeglądarkowe) — to zgodne z zasadami TMDB dla aplikacji klienckich. W razie nadużycia możesz go zresetować w ustawieniach konta TMDB.

## Test lokalny

```bash
python -m http.server 8000
# otwórz http://localhost:8000
```
(repertuar wczyta się z `data/films.json`, a Firebase/TMDB zadziałają normalnie — to zwykłe zapytania z przeglądarki, niezależne od tego, gdzie hostujesz pliki)
