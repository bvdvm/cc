// Kryteria oceniania — przepisane 1:1 z notatek Karoliny.
// Każde kryterium ma 5 poziomów (1-5 pkt) z opisem, pokazywanym jako podpowiedź przy ocenianiu.

export const UNIVERSAL_CRITERIA = [
  { id: 1, name: 'Fabuła / Historia', question: 'Jak ciekawa i wciągająca była historia?',
    levels: ['nudna, przewidywalna', 'trochę nudna, mało zaskakująca', 'przyjemna, średnio wciągająca', 'ciekawa, trzyma w napięciu', 'niesamowita, nie mogłam oderwać się od czytania'] },
  { id: 2, name: 'Bohaterowie', question: 'Czy postacie były interesujące i wiarygodne?',
    levels: ['płaskie, nudne', 'trochę ciekawe, ale nieangażujące', 'średnio ciekawi', 'interesujący, dobrze rozwinięci', 'pełni życia, zapadają w pamięć'] },
  { id: 3, name: 'Styl i język', question: 'Jak podobał Ci się sposób pisania?',
    levels: ['trudny do czytania lub nużący', 'przeciętny, niezbyt przyjemny', 'w porządku, czytało się bez problemu', 'przyjemny, płynny styl', 'mistrzowski, zachwycający'] },
  { id: 4, name: 'Emocje / Wrażenia', question: 'Czy książka wywołała w Tobie emocje?',
    levels: ['w ogóle nic nie czułam', 'odrobinę, ale niezbyt silnie', 'średnio emocjonująca', 'mocne wrażenia, wzruszająca / ekscytująca', 'całkowicie mnie poruszyła'] },
  { id: 5, name: 'Oryginalność', question: 'Czy fabuła lub pomysł były nietypowe i zaskakujące?',
    levels: ['przewidywalna, bez pomysłów', 'lekko przewidywalna', 'kilka ciekawych momentów', 'oryginalna, zaskakujące zwroty akcji', 'totalnie zaskakująca i unikalna'] },
  { id: 6, name: 'Tempo akcji', question: 'Czy fabuła była dobrze poprowadzona?',
    levels: ['monotonne, zgubne', 'chwilami wciągające, chwilami nudne', 'średnie tempo, w porządku', 'dobrze wyważone, angażujące', 'wciąga od początku do końca'] },
  { id: 7, name: 'Świat przedstawiony / wizualność', question: 'Czy opisy pozwalały wyobrazić sobie cały świat?',
    levels: ['płytki świat, ciężko sobie wyobrazić', 'niby rozumiem, ale nie mogę sobie wyobrazić', 'w sumie spoko, ale nic nadzwyczajnego', 'dało się to zwizualizować, ale czegoś jednak brakowało', 'realistyczne wyobrażenie, łatwo sobie zwizualizować'] },
  { id: 8, name: 'Moralność / przesłanie', question: 'Czy książka miała głębszy sens, wartościową myśl lub morał?',
    levels: ['brak przesłania', 'słabe, ledwo zauważalne', 'umiarkowane, dające do myślenia', 'wyraźne, inspirujące przesłanie', 'głębokie, wartościowe, prowokuje do refleksji'] },
  { id: 9, name: 'Pamięć po przeczytaniu', question: 'Czy książka zostaje w pamięci na długo?',
    levels: ['chce zapomnieć', 'fabuła łatwa do zapomnienia', 'przeciętna pamięć, kilka momentów zostaje w pamięci', 'wyraźnie długo pozostanie w głowie, pamiętasz wiele elementów', 'zostaje w pamięci na długo, intensywne wrażenia, łatwo ją wspominać i analizować'] },
  { id: 10, name: 'Humor / lekkość', question: 'Czy książka potrafiła Cię rozbawić lub miała lekki, przyjemny ton?',
    levels: ['brak humoru, ciężki ton', 'sporadyczny humor, mało śmieszne', 'umiarkowany humor, momenty zabawne', 'przyjemna, śmieszne momenty', 'bardzo zabawna, lekka, poprawiająca humor'] },
  { id: 11, name: 'Napięcie / dramatyzm', question: 'Czy książka trzymała w napięciu, emocjonowała?',
    levels: ['brak napięcia, monotonna', 'chwilowe momenty napięcia', 'średnio emocjonująca', 'trzyma w napięciu, emocjonująca', 'maksymalne napięcie, angażuje całkowicie'] },
  { id: 12, name: 'Uczucia', question: 'Czy jesteś w stanie odczuć emocje bohaterów?',
    levels: ['brak emocji, trudno się utożsamić', 'niewielkie emocje, rzadko angażują', 'średnio poruszające, momentami można wczuć się w bohaterów', 'wyraźne emocje, można odczuwać doświadczenia bohaterów', 'głębokie emocje, intensywnie wczuwasz się w bohaterów'] },
  { id: 13, name: 'Plot twist', question: 'Czy fabuła zaskoczyła?',
    levels: ['przewidywalna fabuła, żadnych zaskoczeń', 'kilka niewielkich momentów zaskoczenia, większość wątków przewidywalna', 'kilka ciekawych zwrotów akcji, średnio zaskakująca', 'wciągająca, kilka momentów zaskoczenia, nieprzewidywalna w kluczowych momentach', 'mistrzowskie zwroty akcji, fabuła całkowicie zaskakuje, trudno odgadnąć rozwój wydarzeń'] },
];

// Kryteria dodatkowe — zależne od gatunku. Klucz = etykieta grupy gatunków z notatek.
export const GENRE_BONUS_GROUPS = [
  {
    key: 'kryminal_thriller_horror',
    label: 'Kryminał / thriller / horror',
    genres: ['Kryminał', 'Thriller', 'Horror'],
    icon: '🔎',
    criterion: { id: 14, name: 'Zaskoczenie / zagadki', question: 'Czy fabuła zaskoczyła?',
      levels: ['łatwe do odgadnięcia, przewidywalne', 'kilka zaskoczeń', 'umiarkowanie zaskakujące', 'ciekawe zagadki, wciągające', 'mistrzowskie zagadki, całkowicie zaskakujące'] },
  },
  {
    key: 'scifi_fantastyka',
    label: 'Science fiction / fantastyka',
    genres: ['Science fiction', 'Fantastyka'],
    icon: '🪐',
    criterion: { id: 15, name: 'Elementy fantastyczne', question: 'Czy elementy fantastyczne były dobrze opisane i jakie jest tego wyobrażenie?',
      levels: ['bardzo słabo opisane, trudno wyobrazić sobie świat lub technologię', 'opis niepełny, momentami mylący lub nudny', 'średnio opisane, da się wyobrazić świat, ale bez szczegółów', 'dobrze opisane, klarowne wyobrażenie, ciekawy świat', 'mistrzowsko wykreowane elementy fantastyczne, łatwo wyobrazić sobie świat, niezwykle wciągające'] },
  },
  {
    key: 'dark_romance',
    label: 'Dark romance',
    genres: ['Dark romance'],
    icon: '🖤',
    criterion: { id: 16, name: 'Spicy sceny', question: 'Jak były opisane?',
      levels: ['za dużo scen, przesadne, obżydliwe, męczące do czytania', 'zbyt częste lub nie do końca przemyślane, trochę męczące', 'umiarkowane, średnio angażujące, nie przeszkadzają w odbiorze fabuły', 'dobrze wyważone, emocjonujące, pasują do fabuły', 'idealnie dopasowane, realistyczne, mocno angażujące emocje czytelnika'] },
  },
  {
    key: 'mlodziezowka',
    label: 'Młodzieżówka',
    genres: ['Młodzieżówka'],
    icon: '🎒',
    criterion: { id: 17, name: '"First times"', question: 'Czy ciekawie zostały opisane pierwsze wrażenia bohaterów (miłość, przyjaźń, bunt, imprezy, szkoła)?',
      levels: ['nieciekawie opisane, brak emocji, nudne', 'słabo opisane, mało wciągające lub przewidywalne', 'przeciętnie opisane, częściowo angażuje emocje bohaterów', 'ciekawie i wiarygodnie opisane, emocje bohaterów odczuwalne', 'bardzo dobrze opisane, pełne emocji, mocno angażuje czytelnika i pozwala wczuć się w doświadczenia bohaterów'] },
  },
  {
    key: 'romans',
    label: 'Romans',
    genres: ['Romans'],
    icon: '💛',
    criterion: { id: 18, name: 'Chemia między postaciami', question: 'Czy relacje między bohaterami były przekonujące i przyciągające uwagę?',
      levels: ['brak chemii, relacje sztuczne', 'słaba chemia, niewiele emocji w relacjach', 'umiarkowana, momentami wiarygodna', 'dobra chemia, emocjonujące relacje', 'silna chemia, relacje przekonujące, pełne emocji'] },
  },
  {
    key: 'literatura_faktu',
    label: 'Literatura faktu',
    genres: ['Literatura faktu'],
    icon: '📰',
    criterion: { id: 19, name: 'Treść merytoryczna / informacyjna', question: 'Czy fabuła była wartościowa?',
      levels: ['uboga, chaotyczna', 'kilka wartościowych informacji', 'przeciętna, użyteczna', 'bogata, dobrze udokumentowana', 'bardzo wartościowa, wyjątkowo merytoryczna'] },
  },
];

// Pełna lista gatunków do tagowania książki (checkboxy przy dodawaniu)
export const ALL_GENRES = GENRE_BONUS_GROUPS.flatMap(g => g.genres).concat(['Inne']);

// Formaty odczytu
export const FORMATS = [
  { id: 'papier', label: 'Papier', icon: '📖' },
  { id: 'ebook', label: 'Ebook', icon: '📱' },
  { id: 'audiobook', label: 'Audiobook', icon: '🎧' },
];

// Zwraca listę grup bonusowych pasujących do wybranych gatunków książki (bez duplikatów)
export function bonusGroupsForGenres(selectedGenres = []) {
  return GENRE_BONUS_GROUPS.filter(g => g.genres.some(genre => selectedGenres.includes(genre)));
}
