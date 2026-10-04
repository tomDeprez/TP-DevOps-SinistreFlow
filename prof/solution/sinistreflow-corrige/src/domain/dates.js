const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 1000 * 60 * 60 * 24;
const pad = (n) => String(n).padStart(2, '0');

/**
 * Convertit une date saisie "AAAA-MM-JJ" en objet Date (minuit, heure locale).
 * Retourne null si la chaîne n'est pas une date valide (ex : 2026-02-31).
 */
function parseIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  // SF-102 : en JavaScript les mois vont de 0 (janvier) à 11 (décembre)
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function isFutureDate(value, now = new Date()) {
  const date = parseIsoDate(value);
  return date !== null && date > now;
}

/** Nombre de jours pleins entre deux dates. */
function daysBetween(from, to) {
  // SF-103 : 1 jour = 1000 ms * 60 s * 60 min * 24 h
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Formate une date (colonne SQL DATE) en "AAAA-MM-JJ" pour l'API.
 * SF-111 : une colonne DATE n'a pas de fuseau horaire. toISOString() convertit en UTC
 * et décale d'un jour quand le serveur tourne en Europe/Paris.
 */
function formatDate(date) {
  if (!date) return null;
  if (typeof date === 'string') return date.slice(0, 10);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

module.exports = { parseIsoDate, isFutureDate, daysBetween, formatDate };
