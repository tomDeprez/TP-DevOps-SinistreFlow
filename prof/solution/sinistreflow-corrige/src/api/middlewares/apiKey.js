const partnerRepository = require('../../repositories/partnerRepository');
const { UnauthorizedError } = require('../../domain/errors');
const { apiVersionRequestsTotal } = require('../../observability/metrics');

/**
 * Authentification des partenaires par clé API.
 * Le partenaire envoie sa clé dans l'en-tête HTTP "X-API-Key".
 */
module.exports = async function apiKeyAuth(req, res, next) {
  try {
    // SF-101 : Node.js met les noms d'en-têtes en minuscules ; req.get() est insensible à la casse
    const apiKey = req.get('X-API-Key');
    if (!apiKey) throw new UnauthorizedError('Clé API manquante');

    const partner = await partnerRepository.findActiveByApiKey(apiKey);
    if (!partner) throw new UnauthorizedError('Clé API invalide');

    req.partner = partner;
    apiVersionRequestsTotal.inc({ version: req.baseUrl.replace('/api/', ''), partner: partner.name });
    next();
  } catch (err) {
    next(err);
  }
};
