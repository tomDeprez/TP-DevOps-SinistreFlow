const { computeIndemnityCents } = require('../../src/domain/indemnity');

describe('computeIndemnityCents (SF-106)', () => {
  test('déduit la franchise convertie en centimes', () => {
    // 1 000 € expertisés, franchise 150 € -> 850 €
    expect(computeIndemnityCents(100000, 150)).toBe(85000);
  });

  test('ne devient jamais négative', () => {
    // bris de glace à 120 €, franchise 150 € -> rien à verser
    expect(computeIndemnityCents(12000, 150)).toBe(0);
  });

  test('franchise nulle', () => {
    expect(computeIndemnityCents(50000, 0)).toBe(50000);
  });
});
