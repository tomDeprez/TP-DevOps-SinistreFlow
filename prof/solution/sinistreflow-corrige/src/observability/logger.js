/**
 * Logs structurés JSON (une ligne = un événement) : lisibles par `docker logs`,
 * et directement exploitables par Loki / ELK.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL || 'info'] || LEVELS.info;
const silent = process.env.NODE_ENV === 'test';

function log(level, event, fields = {}) {
  if (silent || LEVELS[level] < threshold) return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, service: 'sinistreflow', event, ...fields });
  if (level === 'error' || level === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

module.exports = {
  debug: (event, fields) => log('debug', event, fields),
  info: (event, fields) => log('info', event, fields),
  warn: (event, fields) => log('warn', event, fields),
  error: (event, fields) => log('error', event, fields),
};
