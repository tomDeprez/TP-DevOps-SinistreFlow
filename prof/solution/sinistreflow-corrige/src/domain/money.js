const { ValidationError } = require('./errors');

const AMOUNT_FORMAT = /^\d+(\.\d{1,2})?$/;

/**
 * Convertit un montant saisi par l'assuré (en euros) en centimes.
 * Exemples : "1250" -> 125000, "19.99" -> 1999, "1 250,50" -> 125050
 */
function parseAmountToCents(input) {
  if (input === undefined || input === null || input === '') return null;
  // SF-113 : saisie à la française (virgule décimale, espaces / espaces insécables comme séparateurs de milliers)
  const normalized = String(input).replace(/[\s  ]/g, '').replace(',', '.');
  if (!AMOUNT_FORMAT.test(normalized)) {
    throw new ValidationError('Montant estimé invalide', [`"${input}" n'est pas un montant valide`]);
  }
  // calcul sur la chaîne : pas d'erreur d'arrondi flottant (19.99 * 100 = 1998.9999...)
  const [euros, decimals = ''] = normalized.split('.');
  return Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
}

function centsToEuros(cents) {
  if (cents === null || cents === undefined) return null;
  return Number(cents) / 100;
}

module.exports = { parseAmountToCents, centsToEuros };
