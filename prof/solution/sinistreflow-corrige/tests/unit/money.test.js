const { parseAmountToCents, centsToEuros } = require('../../src/domain/money');

describe('parseAmountToCents', () => {
  test.each([
    ['1250', 125000],
    ['19.99', 1999], // SF-113 : 19.99 * 100 = 1998.9999... en flottant
    ['0.29', 29],
    ['1250,50', 125050], // virgule décimale française
    ['1 250,50', 125050], // séparateur de milliers
    ['1 250,5', 125050], // espace fine insécable (copier-coller depuis un PDF)
    [1250.5, 125050],
    ['0', 0],
  ])('%p -> %p centimes', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  test.each([['', null], [null, null], [undefined, null]])('%p -> null', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  test.each(['abc', '-10', '12,345', '1.2.3', '12€'])('refuse %p', (input) => {
    expect(() => parseAmountToCents(input)).toThrow('Montant estimé invalide');
  });
});

describe('centsToEuros', () => {
  test('convertit les centimes en euros', () => {
    expect(centsToEuros(125050)).toBe(1250.5);
  });

  test('accepte une valeur BIGINT sous forme de chaîne', () => {
    expect(centsToEuros('125050')).toBe(1250.5);
  });

  test('null reste null', () => {
    expect(centsToEuros(null)).toBeNull();
  });
});
