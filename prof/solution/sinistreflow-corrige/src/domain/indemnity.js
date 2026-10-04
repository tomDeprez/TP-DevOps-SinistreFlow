/**
 * Indemnité versée à l'assuré = montant retenu par l'expert - franchise du contrat.
 * @param {number} assessedAmountCents montant expertisé (centimes)
 * @param {number} franchiseEur franchise du contrat (colonne contracts.franchise_eur, en EUROS)
 * @returns {number} indemnité en centimes, jamais négative
 */
function computeIndemnityCents(assessedAmountCents, franchiseEur) {
  // SF-106 : la franchise est stockée en euros -> conversion en centimes, et plancher à 0
  return Math.max(0, assessedAmountCents - franchiseEur * 100);
}

module.exports = { computeIndemnityCents };
