import { UNIVERSAL_CRITERIA, bonusGroupsForGenres } from './criteria-data.js';

// Zakładki (poziomy oceny) — dokładnie wg zasad Karoliny
export const BOOKMARK_TIERS = [
  { min: 0, max: 29, id: 'paper', label: 'papierowa zakładka', color: 'var(--paper)', textColor: '#3a3628' },
  { min: 30, max: 49, id: 'cardboard', label: 'kartonowa zakładka', color: 'var(--cardboard)', textColor: '#2c1a0d' },
  { min: 50, max: 69, id: 'wood', label: 'drewniana zakładka', color: 'var(--wood)', textColor: '#f2e6d8' },
  { min: 70, max: 89, id: 'leather', label: 'skórzana zakładka', color: 'var(--leather)', textColor: '#f2e6d8' },
  { min: 90, max: 100, id: 'gold', label: 'złota zakładka', color: 'var(--gold)', textColor: '#241a06' },
];

// Przelicznik procent -> gwiazdki, dokładnie wg tabeli z notatek
const STAR_BANDS = [
  { min: 0, max: 19, stars: 1 }, { min: 20, max: 29, stars: 1.5 },
  { min: 30, max: 39, stars: 2 }, { min: 40, max: 49, stars: 2.5 },
  { min: 50, max: 59, stars: 3 }, { min: 60, max: 69, stars: 3.5 },
  { min: 70, max: 79, stars: 4 }, { min: 80, max: 89, stars: 4.5 },
  { min: 90, max: 100, stars: 5 },
];

export function criteriaForGenres(genres = []) {
  const bonus = bonusGroupsForGenres(genres).map(g => g.criterion);
  return [...UNIVERSAL_CRITERIA, ...bonus];
}

export function percentToStars(percent) {
  const band = STAR_BANDS.find(b => percent >= b.min && percent <= b.max) || STAR_BANDS[0];
  return band.stars;
}

export function tierForPercent(percent) {
  return BOOKMARK_TIERS.find(t => percent >= t.min && percent <= t.max) || BOOKMARK_TIERS[0];
}

// scores: { [criterionId]: 1-5 }, genres: string[]
export function calcRating(scores, genres = []) {
  const criteria = criteriaForGenres(genres);
  const scored = criteria.filter(c => typeof scores[c.id] === 'number');
  if (scored.length === 0) return null;
  const total = scored.reduce((sum, c) => sum + scores[c.id], 0);
  const max = scored.length * 5;
  const percent = Math.round((total / max) * 1000) / 10; // 1 miejsce po przecinku
  return {
    percent,
    stars: percentToStars(percent),
    tier: tierForPercent(percent),
    scoredCount: scored.length,
    totalCriteria: criteria.length,
  };
}

export function starsToString(stars) {
  const full = Math.floor(stars);
  const half = stars % 1 !== 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half ? 1 : 0));
}
