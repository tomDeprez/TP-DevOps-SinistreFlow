/**
 * OUTIL PROF — génère les données "production anonymisée" de SinistreFlow.
 * Sortie : SQL d'INSERT (stdout) à appliquer sur un schéma migré jusqu'à la version 9.
 * Voir prof/tools/build-dump.sh pour la génération du dump complet (pg_dump).
 *
 * Pièges de données volontaires (ne pas casser) :
 *  - références globales SIN-AAAA-NNNNNN avec des trous (dossiers supprimés)   -> SF-104
 *  - dossiers AUTO déclarés après la migration 8 : immatriculation uniquement
 *    dans vehicles, claims.immatriculation = NULL                              -> SF-109
 *  - ~25 % des emails stockés avec des majuscules (import 2021)                -> SF-112
 *  - noms avec apostrophe (D'Almeida, N'Diaye, O'Connor)                       -> SF-108
 *  - 14 dossiers EXPERTISE_EN_COURS (dont 10 AUTO) pour le client ExpertAuto   -> SF-107
 */

let seed = 20260928;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const int = (min, max) => min + Math.floor(rand() * (max - min + 1));
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const pad = (n, l) => String(n).padStart(l, '0');
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
const isoTs = (d) => d.toISOString().replace('T', ' ').replace('Z', '+00');
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const noAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[' ]/g, '');

const FIRST = ['Camille', 'Lucas', 'Léa', 'Hugo', 'Chloé', 'Louis', 'Manon', 'Gabriel', 'Inès', 'Arthur', 'Jade', 'Jules',
  'Louise', 'Adam', 'Emma', 'Raphaël', 'Alice', 'Nathan', 'Sarah', 'Théo', 'Zoé', 'Mohamed', 'Yasmine', 'Thomas',
  'Julie', 'Nicolas', 'Élodie', 'Karim', 'Sophie', 'Antoine', 'Fatou', 'Pierre', 'Mathilde', 'Kevin', 'Aïcha', 'Romain'];
const LAST = ['Durand', 'Bernard', 'Martin', 'Petit', 'Robert', 'Richard', 'Dubois', 'Moreau', 'Laurent', 'Simon',
  'Michel', 'Lefebvre', 'Leroy', 'Roux', 'David', 'Bertrand', 'Morel', 'Fournier', 'Girard', 'Bonnet', 'Dupont',
  'Lambert', 'Fontaine', 'Rousseau', 'Vincent', 'Muller', 'Faure', 'André', 'Mercier', 'Blanc', 'Guerin', 'Boyer',
  "D'Almeida", "N'Diaye", "O'Connor", "D'Angelo", 'Benali', 'Nguyen', 'Garnier', 'Chevalier'];
const CITIES = ['Lyon 3e', 'Villeurbanne', 'Grenoble', 'Saint-Étienne', 'Annecy', 'Chambéry', 'Valence', 'Vienne',
  'Bourgoin-Jallieu', 'Voiron', 'Échirolles', 'Bron', 'Vénissieux', 'Meylan', 'Caluire-et-Cuire'];
const PLACES_AUTO = ['parking du centre commercial', 'rond-point de la rocade', 'rue Victor Hugo', 'A43 sortie 7',
  'avenue Jean Jaurès', 'parking de la gare', 'boulevard des Alpes', 'route départementale D1075'];
const BRANDS = [['Renault', ['Clio', 'Megane', 'Captur']], ['Peugeot', ['208', '308', '3008']], ['Citroën', ['C3', 'C4']],
  ['Toyota', ['Yaris', 'Corolla']], ['Volkswagen', ['Golf', 'Polo']], ['Dacia', ['Sandero', 'Duster']], ['Tesla', ['Model 3']]];
const INSURERS = ['MAAF', 'MACIF', 'AXA', 'Allianz', 'Groupama', 'Matmut', 'GMF', 'MMA'];
const DESC = {
  AUTO_COLLISION: ['Accrochage à faible vitesse, pare-choc arrière enfoncé et feu cassé.',
    'Collision au carrefour, le tiers n\'a pas respecté la priorité à droite. Aile avant droite endommagée.',
    'Choc avec un poteau en manœuvrant sur le parking, portière arrière gauche rayée et enfoncée.'],
  AUTO_VOL: ['Véhicule volé pendant la nuit devant le domicile, constaté le matin. Plainte déposée.',
    'Vol du véhicule sur le parking de la gare, clés toujours en ma possession.'],
  BRIS_DE_GLACE: ['Impact de gravillon sur le pare-brise devenu une fissure de 30 cm.',
    'Vitre conducteur brisée lors d\'une tentative d\'effraction, rien n\'a été volé.'],
  DEGAT_DES_EAUX: ['Fuite du ballon d\'eau chaude, parquet du séjour gondolé sur 12 m².',
    'Infiltration depuis l\'appartement du dessus, plafond de la salle de bain taché et peinture écaillée.'],
  INCENDIE: ['Départ de feu dans la cuisine (friteuse), hotte et meubles hauts détruits, suie dans la pièce.'],
  CAMBRIOLAGE: ['Porte d\'entrée fracturée en notre absence, ordinateur portable et bijoux dérobés. Plainte déposée.',
    'Cambriolage par la fenêtre du rez-de-chaussée, télévision et console volées.'],
};

const MIGRATION_8_DATE = new Date(Date.UTC(2025, 2, 10, 9, 0, 0)); // 10/03/2025
const DUMP_DATE = new Date(Date.UTC(2026, 8, 28, 2, 0, 0)); // 28/09/2026
const out = [];
const emit = (s) => out.push(s);

// ---------- assurés ----------
const holders = [];
const usedEmails = new Set();
// comptes de démonstration documentés dans le README
const DEMO = [
  { first: 'Camille', last: 'Durand', email: 'Camille.Durand@Example.test' },  // email stocké avec majuscules -> SF-112
  { first: 'Lucas', last: 'Bernard', email: 'lucas.bernard@example.test' },
  { first: 'Inès', last: "D'Almeida", email: 'ines.dalmeida@example.test' },
];
for (const d of DEMO) {
  holders.push(d);
  usedEmails.add(d.email.toLowerCase());
}
while (holders.length < 90) {
  const first = pick(FIRST);
  const last = pick(LAST);
  let email = `${noAccent(first)}.${noAccent(last)}`.toLowerCase();
  let n = 1;
  while (usedEmails.has(`${email}${n > 1 ? n : ''}@example.test`)) n++;
  email = `${email}${n > 1 ? n : ''}@example.test`;
  usedEmails.add(email);
  // import 2021 : les emails n'étaient pas normalisés
  if (rand() < 0.25) {
    email = email.replace(/^([a-z])/, (m) => m.toUpperCase()).replace(/\.([a-z])/, (m, c) => `.${c.toUpperCase()}`);
    if (rand() < 0.4) email = email.replace('@example.test', '@Example.test');
  }
  holders.push({ first, last, email });
}
emit('-- assurés');
holders.forEach((h, i) => {
  h.id = i + 1;
  const created = addDays(new Date(Date.UTC(2021, 0, 15)), int(0, 900));
  emit(`INSERT INTO policyholders (id, first_name, last_name, email, phone, created_at) VALUES (${h.id}, ${q(h.first)}, ${q(h.last)}, ${q(h.email)}, ${q(`06${pad(int(0, 99999999), 8)}`)}, ${q(isoTs(created))});`);
});

// ---------- contrats ----------
const contracts = [];
let autoSeq = 1000;
let habSeq = 2000;
function addContract(holder, product, status, start) {
  const number = product === 'AUTO' ? `MA-AUTO-${pad(++autoSeq, 6)}` : `MA-HAB-${pad(++habSeq, 6)}`;
  const franchise = product === 'AUTO' ? pick([150, 200, 300]) : pick([250, 350]);
  const c = { id: contracts.length + 1, number, holderId: holder.id, product, status, start, franchise };
  contracts.push(c);
  return c;
}
// démo : Camille -> MA-AUTO-001001 (franchise 300), Lucas -> MA-HAB-002001, Inès -> MA-AUTO-001002
addContract(holders[0], 'AUTO', 'ACTIF', new Date(Date.UTC(2022, 4, 1))).franchise = 300;
addContract(holders[1], 'HABITATION', 'ACTIF', new Date(Date.UTC(2021, 8, 1))).franchise = 250;
addContract(holders[2], 'AUTO', 'ACTIF', new Date(Date.UTC(2023, 0, 10))).franchise = 150;
for (let i = 3; i < holders.length; i++) {
  const h = holders[i];
  const r = rand();
  const products = r < 0.45 ? ['AUTO'] : r < 0.75 ? ['HABITATION'] : ['AUTO', 'HABITATION'];
  for (const p of products) {
    const status = rand() < 0.88 ? 'ACTIF' : pick(['RESILIE', 'SUSPENDU']);
    addContract(h, p, status, addDays(new Date(Date.UTC(2019, 0, 1)), int(0, 1800)));
  }
}
// contrat résilié de démonstration (doit être refusé à l'étape 1)
addContract(holders[1], 'AUTO', 'RESILIE', new Date(Date.UTC(2020, 1, 1)));
emit('\n-- contrats');
for (const c of contracts) {
  const end = c.status === 'RESILIE' ? q(isoDate(addDays(c.start, int(365, 1400)))) : 'NULL';
  emit(`INSERT INTO contracts (id, contract_number, policyholder_id, product, status, start_date, end_date, created_at, franchise_eur) VALUES (${c.id}, ${q(c.number)}, ${c.holderId}, ${q(c.product)}, ${q(c.status)}, ${q(isoDate(c.start))}, ${end}, ${q(isoTs(c.start))}, ${c.franchise});`);
}

// ---------- dossiers ----------
const TOTAL = 460;
const DELETED = new Set();
while (DELETED.size < 35) {
  const n = int(5, 400); // les suppressions concernent des dossiers anciens (doublons, tests...)
  DELETED.add(n);
}
const START = new Date(Date.UTC(2022, 0, 5, 8, 0, 0));
const span = DUMP_DATE.getTime() - START.getTime() - 4 * 86400000;
const activeAuto = contracts.filter((c) => c.product === 'AUTO' && c.status === 'ACTIF');
const activeHab = contracts.filter((c) => c.product === 'HABITATION' && c.status === 'ACTIF');
const allClaims = [];

function statusFor(declared, n) {
  const ageDays = (DUMP_DATE - declared) / 86400000;
  if (ageDays > 240) return pick(['CLOS', 'CLOS', 'CLOS', 'INDEMNISE', 'REFUSE', 'CLOS']);
  if (ageDays > 90) return pick(['CLOS', 'INDEMNISE', 'ACCEPTE', 'REFUSE', 'EXPERTISE_TERMINEE']);
  if (ageDays > 20) return pick(['ACCEPTE', 'EXPERTISE_TERMINEE', 'EN_INSTRUCTION', 'INDEMNISE', 'REFUSE']);
  return pick(['DECLARE', 'DECLARE', 'EN_INSTRUCTION', 'EN_INSTRUCTION']);
}
const PATH = ['DECLARE', 'EN_INSTRUCTION', 'EXPERTISE_EN_COURS', 'EXPERTISE_TERMINEE', 'ACCEPTE', 'INDEMNISE', 'CLOS'];
function historyFor(status) {
  if (status === 'REFUSE') return ['DECLARE', 'EN_INSTRUCTION', 'REFUSE'];
  return PATH.slice(0, PATH.indexOf(status) + 1);
}

let expertiseCount = 0;
for (let n = 1; n <= TOTAL; n++) {
  // déclarations réparties linéairement, les 40 dernières en 2026 (dont le n°426 -> collision SF-104)
  let declared;
  if (n <= 420) declared = new Date(START.getTime() + (span * 0.93 * (n - 1)) / 419);
  else declared = new Date(Date.UTC(2026, 3, 1) + ((DUMP_DATE - Date.UTC(2026, 3, 8)) * (n - 421)) / 39);
  declared = new Date(declared.getTime() + int(0, 10 * 3600) * 1000);

  const isAuto = rand() < 0.6;
  const contract = isAuto ? pick(activeAuto) : pick(activeHab);
  let type = isAuto ? pick(['AUTO_COLLISION', 'AUTO_COLLISION', 'AUTO_VOL', 'BRIS_DE_GLACE']) : pick(['DEGAT_DES_EAUX', 'DEGAT_DES_EAUX', 'INCENDIE', 'CAMBRIOLAGE']);
  let status = statusFor(declared, n);
  allClaims.push({ n, declared, contract, type, status });
}
// 14 dossiers récents en attente d'expertise (10 AUTO_COLLISION / BRIS_DE_GLACE, 4 habitation)
const recent = allClaims.filter((c) => c.n > 430 && c.n < 459);
let autoPending = 0;
let habPending = 0;
for (const c of recent) {
  if (autoPending < 10 && c.n % 2 === 0) {
    c.contract = pick(activeAuto);
    c.type = pick(['AUTO_COLLISION', 'AUTO_COLLISION', 'BRIS_DE_GLACE']);
    c.status = 'EXPERTISE_EN_COURS';
    autoPending++;
  } else if (habPending < 4 && c.n % 3 === 0) {
    c.contract = pick(activeHab);
    c.type = 'DEGAT_DES_EAUX';
    c.status = 'EXPERTISE_EN_COURS';
    habPending++;
  }
}

emit('\n-- dossiers sinistres');
const historyLines = [];
const vehicleLines = [];
const expertiseLines = [];
for (const c of allClaims) {
  if (DELETED.has(c.n)) continue;
  const year = c.declared.getUTCFullYear();
  c.reference = `SIN-${year}-${pad(c.n, 6)}`;
  const theft = c.type === 'AUTO_VOL' || c.type === 'CAMBRIOLAGE';
  const delay = rand() < 0.12 ? int(theft ? 3 : 6, 25) : int(0, theft ? 2 : 5);
  const incident = addDays(c.declared, -delay);
  const late = delay > (theft ? 2 : 5);
  const estimated = c.type === 'BRIS_DE_GLACE' ? int(250, 1200) * 100 + int(0, 99)
    : c.type === 'INCENDIE' ? int(3000, 25000) * 100
      : c.type === 'AUTO_VOL' ? int(4000, 22000) * 100
        : int(400, 6000) * 100 + pick([0, 0, 50, 99]);
  const thirdParty = c.type === 'AUTO_COLLISION' && rand() < 0.5;
  const isAuto = c.contract.product === 'AUTO';
  const brand = pick(BRANDS);
  const plate = isAuto ? `${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}-${pad(int(1, 999), 3)}-${String.fromCharCode(65 + int(0, 25))}${String.fromCharCode(65 + int(0, 25))}` : null;
  const beforeM8 = c.declared < MIGRATION_8_DATE;
  const location = c.n > 60 ? `${pick(isAuto ? PLACES_AUTO : ['domicile'])}, ${pick(CITIES)}` : null; // migration 2 en 2022
  const hist = historyFor(c.status);
  let assessed = null;
  let indemnity = null;
  if (hist.includes('EXPERTISE_TERMINEE')) {
    assessed = Math.round(estimated * (0.7 + rand() * 0.35));
    indemnity = Math.max(0, assessed - c.contract.franchise * 100);
  }
  emit(`INSERT INTO claims (id, reference, contract_id, claim_type, incident_date, declared_at, description, status, estimated_amount_cents, immatriculation, incident_location, third_party_involved, third_party_name, third_party_insurer, complaint_number, indemnity_cents, late_declaration) VALUES (${c.n}, ${q(c.reference)}, ${c.contract.id}, ${q(c.type)}, ${q(isoDate(incident))}, ${q(isoTs(c.declared))}, ${q(pick(DESC[c.type]))}, ${q(c.status)}, ${estimated}, ${beforeM8 ? q(plate) : 'NULL'}, ${q(location)}, ${thirdParty}, ${thirdParty ? q(`${pick(FIRST)} ${pick(LAST)}`) : 'NULL'}, ${thirdParty ? q(pick(INSURERS)) : 'NULL'}, ${theft ? q(`PV-${year}-${pad(int(1, 99999), 5)}`) : 'NULL'}, ${indemnity === null ? 'NULL' : indemnity}, ${late});`);

  if (isAuto) {
    vehicleLines.push(beforeM8
      ? `INSERT INTO vehicles (claim_id, plate_number, brand, model) VALUES (${c.n}, ${q(plate)}, NULL, NULL);`
      : `INSERT INTO vehicles (claim_id, plate_number, brand, model) VALUES (${c.n}, ${q(plate)}, ${q(brand[0])}, ${q(pick(brand[1]))});`);
  }
  let t = c.declared;
  hist.forEach((s, i) => {
    if (i > 0) t = addDays(t, int(1, 12));
    if (t > DUMP_DATE) t = new Date(DUMP_DATE.getTime() - int(1, 48) * 3600000);
    const by = i === 0 ? 'assure' : s === 'EXPERTISE_TERMINEE' ? 'partenaire:ExpertAuto' : pick(['gestionnaire:mlefevre', 'gestionnaire:kbenali', 'gestionnaire:sroux']);
    historyLines.push(`INSERT INTO claim_status_history (claim_id, from_status, to_status, changed_at, changed_by) VALUES (${c.n}, ${i === 0 ? 'NULL' : q(hist[i - 1])}, ${q(s)}, ${q(isoTs(t))}, ${q(by)});`);
    if (s === 'EXPERTISE_TERMINEE') {
      expertiseCount++;
      expertiseLines.push(`INSERT INTO expertises (claim_id, expert_name, appointment_date, assessed_amount_cents, conclusion, created_at) VALUES (${c.n}, ${q(pick(['Cabinet ExpertAuto - J. Morel', 'Cabinet ExpertAuto - S. Petit', 'Expertises Rhône-Alpes - A. Faure']))}, ${q(isoDate(addDays(t, -2)))}, ${assessed}, ${q(pick(['Dommages conformes à la déclaration.', 'Réparation économiquement justifiée.', 'Vétusté appliquée de 20 %.']))}, ${q(isoTs(t))});`);
    }
  });
}
emit('\n-- véhicules (reprise migration 8 + saisies postérieures)');
vehicleLines.forEach(emit);
emit('\n-- historique des statuts');
historyLines.forEach(emit);
emit('\n-- expertises');
expertiseLines.forEach(emit);

emit('\n-- séquences');
emit(`SELECT setval('policyholders_id_seq', ${holders.length});`);
emit(`SELECT setval('contracts_id_seq', ${contracts.length});`);
emit(`SELECT setval('claims_id_seq', ${TOTAL});`);
emit(`SELECT setval('claim_reference_seq', ${TOTAL});`);
emit("SELECT setval('vehicles_id_seq', (SELECT MAX(id) FROM vehicles));");
emit("SELECT setval('claim_status_history_id_seq', (SELECT MAX(id) FROM claim_status_history));");
emit("SELECT setval('expertises_id_seq', (SELECT MAX(id) FROM expertises));");

emit('\n-- journal des migrations appliquées en production');
const migDates = ['2021-03-02', '2022-02-14', '2022-06-20', '2022-11-07', '2023-04-03', '2023-09-18', '2024-05-27', '2025-03-10', '2025-10-06'];
const migNames = ['1_init.sql', '2_claim_location.sql', '3_third_party.sql', '4_claim_status_history.sql', '5_contract_franchise.sql',
  '6_reference_sequence.sql', '7_expertise.sql', '8_vehicles.sql', '9_late_declaration.sql'];
migNames.forEach((name, i) => emit(`INSERT INTO schema_migrations (version, name, applied_at) VALUES (${i + 1}, ${q(name)}, ${q(`${migDates[i]} 21:30:00+00`)});`));

process.stdout.write(`${out.join('\n')}\n`);
process.stderr.write(`claims=${TOTAL - DELETED.size} deleted=${DELETED.size} contracts=${contracts.length} holders=${holders.length} expertises=${expertiseCount} pendingAuto=${autoPending} pendingHab=${habPending} ref426Deleted=${DELETED.has(426)}\n`);
