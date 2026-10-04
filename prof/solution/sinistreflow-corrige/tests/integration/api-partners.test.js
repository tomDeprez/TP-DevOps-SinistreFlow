/**
 * Tests de contrat des API partenaires v1 / v2 / v3.
 * Chaque version a SON format : un partenaire externe en dépend, il ne doit jamais changer.
 */
const { request, partner, db, isoDaysAgo, takePendingAutoClaim } = require('./helpers');

const PLATE = /^[A-Z]{2}-\d{3}-[A-Z]{2}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
let recentAuto; // dossier AUTO déclaré après la migration 8 (immatriculation uniquement dans vehicles)

beforeAll(async () => {
  const { rows } = await db.query(
    `SELECT c.reference, v.plate_number, c.incident_date::text AS incident_date
     FROM claims c JOIN vehicles v ON v.claim_id = c.id
     WHERE c.immatriculation IS NULL ORDER BY c.declared_at DESC LIMIT 1`,
  );
  [recentAuto] = rows;
});

afterAll(() => db.pool.end());

describe('authentification partenaire (SF-101)', () => {
  test('sans clé : 401', async () => {
    const res = await request.get('/api/v1/claims');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Clé API manquante');
  });

  test('clé invalide : 401', async () => {
    const res = await request.get('/api/v2/claims/X').set('X-API-Key', 'mauvaise-cle');
    expect(res.status).toBe(401);
  });

  test('le nom de l\'en-tête est insensible à la casse', async () => {
    const res = await request.get('/api/v1/claims?limit=1').set('x-api-key', 'ea_live_7f3c9a1e5b2d4f60');
    expect(res.status).toBe(200);
  });
});

describe('API v1 (format historique)', () => {
  test('contrat de réponse d\'un dossier', async () => {
    const res = await partner.get(`/api/v1/claims/${recentAuto.reference}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['date_sinistre', 'description', 'id', 'immatriculation', 'montant_estime', 'numero_contrat', 'reference', 'statut', 'type_sinistre'],
    );
    expect(typeof res.body.montant_estime).toBe('number');
  });

  test('SF-109 : immatriculation remontée pour un dossier postérieur à la migration 8', async () => {
    const res = await partner.get(`/api/v1/claims/${recentAuto.reference}`);
    expect(res.body.immatriculation).toBe(recentAuto.plate_number);
  });

  test('SF-111 : la date du sinistre est celle de la base (pas de décalage de fuseau)', async () => {
    const res = await partner.get(`/api/v1/claims/${recentAuto.reference}`);
    expect(res.body.date_sinistre).toBe(recentAuto.incident_date);
  });

  test('SF-107 : la page 1 contient les dossiers les plus récents', async () => {
    const { rows } = await db.query("SELECT reference FROM claims WHERE status = 'EXPERTISE_EN_COURS' ORDER BY declared_at DESC");
    const res = await partner.get('/api/v1/claims?statut=EXPERTISE_EN_COURS&page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(rows.length);
    expect(res.body.data.map((c) => c.reference)).toEqual(rows.slice(0, 5).map((r) => r.reference));
  });

  test('SF-107 : les pages ne se chevauchent pas et couvrent tout', async () => {
    const p1 = await partner.get('/api/v1/claims?page=1&limit=50');
    const p2 = await partner.get('/api/v1/claims?page=2&limit=50');
    const refs1 = p1.body.data.map((c) => c.reference);
    const refs2 = p2.body.data.map((c) => c.reference);
    expect(refs1).toHaveLength(50);
    expect(refs2.filter((r) => refs1.includes(r))).toEqual([]);
  });

  test('la v1 est annoncée dépréciée', async () => {
    const res = await partner.get('/api/v1/claims?limit=1');
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.sunset).toBeDefined();
  });
});

describe('API v2', () => {
  test('contrat de réponse d\'un dossier', async () => {
    const res = await partner.get(`/api/v2/claims/${recentAuto.reference}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ['contractNumber', 'description', 'estimatedAmountCents', 'incidentDate', 'incidentLocation', 'indemnityCents',
        'lateDeclaration', 'reference', 'status', 'thirdParty', 'type', 'vehiclePlate'],
    );
  });

  test('SF-109 : vehiclePlate renseigné', async () => {
    const res = await partner.get(`/api/v2/claims/${recentAuto.reference}`);
    expect(res.body.vehiclePlate).toMatch(PLATE);
  });

  test('SF-110 : les montants sont des entiers JSON (pas des chaînes)', async () => {
    const res = await partner.get(`/api/v2/claims/${recentAuto.reference}`);
    expect(Number.isInteger(res.body.estimatedAmountCents)).toBe(true);
  });

  test('dossier inconnu : 404 et pas de stack trace (SF-114)', async () => {
    const res = await partner.get('/api/v2/claims/SIN-1999-000000');
    expect(res.status).toBe(404);
    expect(res.body.stack).toBeUndefined();
  });
});

describe('API v3', () => {
  test('statuts traduits et filtre par statut', async () => {
    const res = await partner.get('/api/v3/claims?status=ASSESSMENT_PENDING&limit=100');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    res.body.items.forEach((c) => expect(c.status).toBe('ASSESSMENT_PENDING'));
  });

  test('statut inconnu : 400', async () => {
    const res = await partner.get('/api/v3/claims?status=EXPERTISE_EN_COURS');
    expect(res.status).toBe(400);
  });

  test('les trois versions décrivent le même dossier', async () => {
    const [v1, v2, v3] = await Promise.all([1, 2, 3].map((v) => partner.get(`/api/v${v}/claims/${recentAuto.reference}`)));
    expect(v1.body.immatriculation).toBe(v2.body.vehiclePlate);
    expect(v2.body.vehiclePlate).toBe(v3.body.vehicle.plate);
    expect(v1.body.date_sinistre).toBe(v2.body.incidentDate);
    expect(v2.body.incidentDate).toBe(v3.body.incident.date);
    expect(v1.body.montant_estime * 100).toBeCloseTo(v2.body.estimatedAmountCents);
    expect(v2.body.estimatedAmountCents).toBe(v3.body.amounts.estimatedCents);
  });
});

describe('dépôt d\'une expertise (parcours ExpertAuto)', () => {
  test('v2 -> calcul de l\'indemnité et relecture v3', async () => {
    const reference = await takePendingAutoClaim();
    const before = await partner.get(`/api/v3/claims/${reference}`);
    const deductible = before.body.contract.deductibleCents;
    const appointmentDate = isoDaysAgo(2);

    const res = await partner.post(`/api/v2/claims/${reference}/expertise`).send({
      expertName: 'Cabinet ExpertAuto - Test',
      appointmentDate, // SF-102 : une date passée récente doit être acceptée
      assessedAmountCents: 100000,
      conclusion: 'Test d\'intégration',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('EXPERTISE_TERMINEE');
    expect(res.body.indemnityCents).toBe(Math.max(0, 100000 - deductible)); // SF-106

    const v3 = await partner.get(`/api/v3/claims/${reference}`);
    expect(v3.body.status).toBe('ASSESSMENT_DONE');
    expect(v3.body.expertise.appointmentDate).toBe(appointmentDate); // SF-111
    expect(v3.body.history.at(-1)).toMatchObject({ from: 'ASSESSMENT_PENDING', to: 'ASSESSMENT_DONE', by: 'partenaire:ExpertAuto' });

    const again = await partner.post(`/api/v2/claims/${reference}/expertise`).send({
      expertName: 'x', appointmentDate, assessedAmountCents: 1,
    });
    expect(again.status).toBe(409);
  });

  test('rapport invalide : 400 avec le détail des erreurs (SF-114)', async () => {
    const reference = (await partner.get('/api/v1/claims?statut=EXPERTISE_EN_COURS&limit=1')).body.data[0].reference;
    const res = await partner.post(`/api/v2/claims/${reference}/expertise`).send({ appointmentDate: '2999-01-01', assessedAmountCents: '12' });
    expect(res.status).toBe(400);
    expect(res.body.details).toEqual(expect.arrayContaining([
      "Le nom de l'expert est obligatoire",
      "La date de rendez-vous d'expertise ne peut pas être dans le futur",
    ]));
  });
});
