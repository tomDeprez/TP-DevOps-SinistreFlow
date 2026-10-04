// Le serveur de production tourne en Europe/Paris : on teste dans ce fuseau (SF-111)
process.env.TZ = 'Europe/Paris';

const { parseIsoDate, isFutureDate, daysBetween, formatDate } = require('../../src/domain/dates');

describe('parseIsoDate', () => {
  test('SF-102 : le mois saisi est bien le mois retenu', () => {
    const d = parseIsoDate('2026-03-15');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(2); // mars = 2 en JavaScript
    expect(d.getDate()).toBe(15);
  });

  test.each(['2026-02-31', '2026-13-01', '15/03/2026', '', null, undefined, 20260315])(
    'rejette une date invalide : %p',
    (value) => {
      expect(parseIsoDate(value)).toBeNull();
    },
  );

  test('accepte le 29 février d\'une année bissextile', () => {
    expect(parseIsoDate('2028-02-29')).not.toBeNull();
  });
});

describe('isFutureDate', () => {
  const now = new Date(2026, 9, 4, 14, 30); // 04/10/2026 14:30

  test('SF-102 : un sinistre d\'avant-hier n\'est pas dans le futur', () => {
    expect(isFutureDate('2026-10-02', now)).toBe(false);
  });

  test('aujourd\'hui n\'est pas dans le futur', () => {
    expect(isFutureDate('2026-10-04', now)).toBe(false);
  });

  test('demain est dans le futur', () => {
    expect(isFutureDate('2026-10-05', now)).toBe(true);
  });
});

describe('daysBetween', () => {
  test('SF-103 : compte des jours et non des heures', () => {
    expect(daysBetween(new Date(2026, 9, 1), new Date(2026, 9, 4))).toBe(3);
  });

  test('jours pleins uniquement', () => {
    expect(daysBetween(new Date(2026, 9, 1), new Date(2026, 9, 1, 23, 59))).toBe(0);
  });
});

describe('formatDate', () => {
  test('SF-111 : une date à minuit (heure de Paris) garde son jour', () => {
    expect(formatDate(new Date(2026, 2, 15))).toBe('2026-03-15');
  });

  test('une chaîne "AAAA-MM-JJ" est renvoyée telle quelle', () => {
    expect(formatDate('2026-03-15')).toBe('2026-03-15');
  });

  test('null reste null', () => {
    expect(formatDate(null)).toBeNull();
  });
});
