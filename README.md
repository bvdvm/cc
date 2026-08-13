# Our Little Library 🌙☀️

Biblioteczka Karoliny i Oli — wspólne ocenianie książek, sagi, ranking, TBR i losowanie.
Zbudowane wg notatek Karoliny (`strona.pdf`), na tym samym pomyśle co KINEAPOLIS: statyczna
strona + Firebase Firestore jako baza, zero backendu do utrzymania.

## Firebase już podpięty

`config.js` ma już wpisany config projektu **seans-cc-poznan** (ten sam, którego używa
KINEAPOLIS). Apka pisze do trzech nowych kolekcji — `library_books`, `library_pickLists`
i `library_sagas` — z przedrostkiem `library_`, więc nie ruszają danych filmowych KINEAPOLIS
w tym samym projekcie. Kolekcje utworzą się same przy pierwszym zapisie.

**Reguły Firestore:** jeśli już wcześniej dodałeś regułę `match /{document=**} { allow read,
write: if true; }` (albo masz taką ogólną regułę od początku) — nic nie musisz robić, ona
i tak obejmuje też `library_sagas`. Dopisywanie osobnych `match` dla każdej kolekcji ma sens
tylko wtedy, gdy reguły są bardziej selektywne (np. wymieniają kolekcje z osobna).

Dopóki `config.js` nie ma poprawnego configu, apka sama przechodzi w **tryb demo**
(przykładowe książki, nic się nie zapisuje) — ale teraz to już nieaktualne, config jest
wpięty na prawdziwe dane.

## Wyszukiwarka książek — dwa źródła naraz

Przy dodawaniu książki apka pyta **dwa źródła równolegle** i łączy wyniki w jedną listę:

1. **[Open Library](https://openlibrary.org)** (projekt Internet Archive) — ogromna,
   międzynarodowa baza, ma okładki, ale jest tworzona głównie przez anglojęzyczną
   społeczność, więc polscy autorzy i polskie wydania są w niej słabiej pokryte.
2. **[Biblioteka Narodowa](https://data.bn.org.pl)** — oficjalny, darmowy, bez klucza
   katalog polskiej bibliografii narodowej (największa taka baza w Polsce). Dużo lepiej
   pokrywa polskie tytuły, ale to surowe dane biblioteczne (format MARC) i **bez okładek**
   — książki z tego źródła pokażą się na liście bez zdjęcia, to normalne.

Jeśli jedno źródło nie odpowie (np. przez chwilową awarię), drugie i tak zwraca wyniki —
wyszukiwanie nie wywala się w całości. **Uwaga:** integrację z Biblioteką Narodową
napisałem na podstawie dokumentacji, ale nie mogłem jej przetestować na żywo (moje
środowisko robocze nie ma dostępu do internetu). Jeśli po wdrożeniu wyszukiwanie polskich
tytułów nadal nie daje wyników mimo dobrego połączenia, sprawdźcie konsolę przeglądarki
(F12) — jeśli pojawi się błąd przy `data.bn.org.pl`, wklejcie go, dokończę.

## Wrzuć na GitHub Pages

Tak samo jak KINEAPOLIS:
```
git init
git add .
git commit -m "Our Little Library"
git remote add origin <twoje-repo>
git push -u origin main
```
Potem w ustawieniach repo → Pages → wybierz branch `main` / folder root.

## Jak jest zorganizowany kod

Ta wersja jest **bez podfolderów** — wszystkie pliki leżą razem.

```
index.html            szkielet strony, zakładki-bookmarki jako nawigacja
style.css          cały wygląd (czarno-złoto-srebrny motyw)
config.js            <- TU wklejasz Firebase config
criteria-data.js     19 kryteriów oceniania (uniwersalne + bonusowe wg gatunku), z notatek
rating.js             liczenie % / gwiazdek / poziomu zakładki
store.js               warstwa danych: Firestore albo tryb demo, ten sam interfejs
books-api.js          wyszukiwanie: Open Library + Biblioteka Narodowa naraz
demo-data.js          przykładowe książki widoczne w trybie demo
ui-rate.js             panel „Oceń” — szukaj/dodaj/oceń, status per-osoba
ui-sagas.js            panel „Sagi” — ręczne dodawanie/usuwanie sag
ui-ranking.js          panel „Ranking”
ui-tbr.js               panel „TBR”
ui-draw.js              panel „Losowanie”
app.js                  spina wszystko, przełącza zakładki
logo.png          Wasze logo
```

Model danych: **jedna kolekcja `books`** obsługuje i TBR, i przeczytane książki — każda
osoba ma swój własny status (`readStatus.karolina` / `readStatus.ola`: `tbr` / `w trakcie`
/ `przeczytana`), więc jedna z Was może skończyć książkę, zanim druga w ogóle zacznie.
Druga kolekcja, `pickLists`, to pule do losowania. Trzecia, `sagas`, to lista sag —
tworzona ręcznie w zakładce „Sagi” albo w locie przy ocenianiu książki — a przypisanie
książki do sagi to po prostu nazwa (`saga`) zapisana na książce.

## Co dokładnie odzwierciedla apka (z notatek Karoliny)

- **Ocenianie**: 13 kryteriów uniwersalnych + kryteria bonusowe zależne od gatunku
  (kryminał/thriller/horror, sci-fi/fantastyka, dark romance, młodzieżówka, romans,
  literatura faktu). Wynik = % → gwiazdki (co pół) → poziom zakładki (papierowa → złota).
- **Status przeczytania jest osobny dla każdej z Was** — Karolina może mieć książkę
  jako „przeczytana” (z oceną), a Ola w tym samym momencie „w trakcie” albo „do
  przeczytania”. Ocenianie odblokowuje się osobno, gdy dana osoba oznaczy „przeczytana”.
- **Format**: papier / ebook / audiobook, do zaznaczenia przy każdej książce.
- **Sagi**: dodajesz ręcznie w zakładce „Sagi” (albo w locie przy ocenianiu) — automatyczna
  średnia (Karolina/Ola) liczy się z książek przypisanych do danej sagi.
- **Ranking**: Wspólny (książki przeczytane przez obie), Mój, Oli — filtrowany po gatunku.
- **TBR**: dodajesz książkę, druga może zaznaczyć „chcę też” — wtedy wskakuje do wspólnej.
  Kolumna zależy od statusu każdej osoby z osobna, więc gdy jedna skończy, książka
  automatycznie znika z jej kolumny i zostaje tylko u drugiej.
- **Losowanie**: dowolna liczba puli, losowanie jednej książki z wybranej puli.
- **Każdą książkę można otworzyć w każdej chwili** — klik w wiersz w Rankingu, w
  pigułkę w Sagach, albo z listy „Wasze książki” w zakładce Oceń (przeszukiwalnej po
  tytule/autorze) — pokazuje pełny formularz z ocenami obu osób, statusem i
  możliwością zaznaczenia „chcę przeczytać” dla siebie, nawet jeśli druga osoba już
  ocenę wystawiła.

Motywy/tropy (np. fake dating) — zostawione na później, tak jak w notatkach; łatwo dodać
jako kolejne pole tagów przy książce (`criteria-data.js` → `ALL_GENRES` to dobre miejsce
żeby dorobić osobną listę `THEMES` analogicznie, kiedy będziecie gotowe).
