// Dane przykładowe — używane wyłącznie w TRYBIE DEMO (gdy Firebase nie jest
// jeszcze skonfigurowany w config.js). Pozwalają zobaczyć jak apka wygląda
// "w akcji" zanim podepniesz prawdziwą bazę.

function scores(obj) { return obj; }

export const DEMO_BOOKS = [
  {
    id: 'demo-1', title: 'Trzecie skrzydło', author: 'Rebecca Yarros',
    coverUrl: 'https://books.google.com/books/content?id=DEMO1&printsec=frontcover&img=1&zoom=1',
    genres: ['Dark romance', 'Science fiction'], format: 'ebook', saga: 'Imperium Piorunów',
    readStatus: { karolina: 'przeczytana', ola: 'przeczytana' },
    addedBy: 'ola', wantToRead: { karolina: true, ola: true },
    ratings: {
      karolina: { scores: scores({1:4,2:5,3:4,4:5,5:4,6:5,7:4,8:3,9:5,10:3,11:5,12:5,13:4,16:4}), percent: 84.6, stars: 4.5, tierId: 'leather' },
      ola: { scores: scores({1:5,2:5,3:4,4:5,5:4,6:5,7:4,8:4,9:5,10:3,11:5,12:5,13:5,16:5}), percent: 89.2, stars: 4.5, tierId: 'leather' },
    },
  },
  {
    id: 'demo-2', title: 'Czwarte skrzydło', author: 'Rebecca Yarros',
    coverUrl: 'https://books.google.com/books/content?id=DEMO2&printsec=frontcover&img=1&zoom=1',
    genres: ['Dark romance', 'Science fiction'], format: 'papier', saga: 'Imperium Piorunów',
    // przykład tego, o co prosił Adam: Karolina już przeczytała, Ola jeszcze nie (w trakcie)
    readStatus: { karolina: 'przeczytana', ola: 'w trakcie' },
    addedBy: 'karolina', wantToRead: { karolina: true, ola: true },
    ratings: {
      karolina: { scores: scores({1:5,2:5,3:4,4:5,5:5,6:4,7:4,8:4,9:5,10:3,11:5,12:5,13:5,16:4}), percent: 90.8, stars: 5, tierId: 'gold' },
      ola: null,
    },
  },
  {
    id: 'demo-3', title: 'Piąta góra', author: 'Paulo Coelho',
    coverUrl: 'https://books.google.com/books/content?id=DEMO3&printsec=frontcover&img=1&zoom=1',
    genres: ['Literatura faktu'], format: 'audiobook', saga: null,
    readStatus: { karolina: 'przeczytana', ola: 'tbr' },
    addedBy: 'karolina', wantToRead: { karolina: true, ola: false },
    ratings: {
      karolina: { scores: scores({1:3,2:3,3:4,4:3,5:3,6:2,7:3,8:5,9:3,10:2,11:2,12:3,13:2,19:4}), percent: 58.5, stars: 3, tierId: 'wood' },
      ola: null,
    },
  },
  {
    id: 'demo-4', title: 'Ludzie Śniegu', author: 'Marta Kisiel',
    coverUrl: 'https://books.google.com/books/content?id=DEMO4&printsec=frontcover&img=1&zoom=1',
    genres: ['Fantastyka', 'Romans'], format: 'papier', saga: null,
    readStatus: { karolina: 'tbr', ola: 'tbr' },
    addedBy: 'ola', wantToRead: { karolina: true, ola: true },
    ratings: { karolina: null, ola: null },
  },
  {
    id: 'demo-5', title: 'Cierń', author: 'Intisar Khanani',
    coverUrl: 'https://books.google.com/books/content?id=DEMO5&printsec=frontcover&img=1&zoom=1',
    genres: ['Fantastyka', 'Młodzieżówka'], format: null, saga: null,
    readStatus: { karolina: 'tbr', ola: 'tbr' },
    addedBy: 'karolina', wantToRead: { karolina: true, ola: null },
    ratings: { karolina: null, ola: null },
  },
  {
    id: 'demo-6', title: 'Cichy pacjent', author: 'Alex Michaelides',
    coverUrl: 'https://books.google.com/books/content?id=DEMO6&printsec=frontcover&img=1&zoom=1',
    genres: ['Thriller'], format: null, saga: null,
    readStatus: { karolina: 'tbr', ola: 'tbr' },
    addedBy: 'ola', wantToRead: { karolina: null, ola: true },
    ratings: { karolina: null, ola: null },
  },
];

export const DEMO_SAGAS = [
  { id: 'saga-1', name: 'Imperium Piorunów' },
  { id: 'saga-2', name: 'Cierń' },
];

export const DEMO_PICK_LISTS = [
  { id: 'pick-1', name: 'Wieczór grozy 🔪', bookIds: ['demo-6'] },
  { id: 'pick-2', name: 'Na lato ☀️', bookIds: ['demo-4', 'demo-5'] },
];
