const { Pool, types } = require('pg');
const config = require('../config');

// SF-110 : node-postgres renvoie les BIGINT (OID 20) sous forme de chaîne pour ne pas perdre
// de précision. Nos montants en centimes restent très loin de Number.MAX_SAFE_INTEGER.
types.setTypeParser(20, (value) => parseInt(value, 10));

// SF-111 : une colonne DATE (OID 1082) est renvoyée telle quelle ("AAAA-MM-JJ"),
// sans conversion en Date JavaScript (qui introduirait un fuseau horaire).
types.setTypeParser(1082, (value) => value);

const pool = new Pool(config.db);

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
