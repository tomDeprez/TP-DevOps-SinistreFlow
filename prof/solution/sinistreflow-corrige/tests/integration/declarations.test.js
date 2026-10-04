const { request, db, isoDaysAgo } = require('./helpers');

afterAll(() => db.pool.end());

const habDeclaration = (overrides = {}) => ({
  contractNumber: 'MA-HAB-002001',
  email: 'lucas.bernard@example.test',
  type: 'DEGAT_DES_EAUX',
  incidentDate: isoDaysAgo(1),
  incidentLocation: 'Lyon 3e',
  description: 'Fuite sous l\'évier de la cuisine, meuble bas gonflé',
  estimatedAmount: '1 250,50',
  ...overrides,
});

describe('étape 1 : identification', () => {
  test('SF-112 : email insensible à la casse (stocké "Camille.Durand@Example.test")', async () => {
    const res = await request.post('/api/public/contracts/verify')
      .send({ contractNumber: 'ma-auto-001001', email: 'camille.durand@example.test' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ contractNumber: 'MA-AUTO-001001', product: 'AUTO', franchiseEur: 300 });
  });

  test('contrat inconnu : 404', async () => {
    const res = await request.post('/api/public/contracts/verify')
      .send({ contractNumber: 'MA-AUTO-999999', email: 'personne@example.test' });
    expect(res.status).toBe(404);
  });

  test('contrat résilié : 400', async () => {
    const res = await request.post('/api/public/contracts/verify')
      .send({ contractNumber: 'MA-AUTO-001060', email: 'lucas.bernard@example.test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/n'est plus actif/);
  });

  test('champs manquants : 400 et non 500 (SF-114)', async () => {
    const res = await request.post('/api/public/contracts/verify').send({});
    expect(res.status).toBe(400);
  });
});

describe('déclaration', () => {
  test('SF-104 : la référence vient de la séquence (pas de collision avec les dossiers existants)', async () => {
    const { rows } = await db.query('SELECT last_value FROM claim_reference_seq');
    const res = await request.post('/api/public/claims').send(habDeclaration());
    expect(res.status).toBe(201);
    const number = Number(res.body.reference.split('-')[2]);
    expect(number).toBeGreaterThan(Number(rows[0].last_value));
    expect(res.body.reference).toMatch(new RegExp(`^SIN-${new Date().getFullYear()}-\\d{6}$`));
  });

  test('deux déclarations successives ont des références différentes', async () => {
    const a = await request.post('/api/public/claims').send(habDeclaration());
    const b = await request.post('/api/public/claims').send(habDeclaration());
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.reference).not.toBe(b.body.reference);
  });

  test('SF-113 : montant saisi à la française', async () => {
    const res = await request.post('/api/public/claims').send(habDeclaration({ estimatedAmount: '1 250,50' }));
    expect(res.body.estimatedAmountCents).toBe(125050);
  });

  test('SF-111 : la date renvoyée est celle saisie', async () => {
    const date = isoDaysAgo(3);
    const res = await request.post('/api/public/claims').send(habDeclaration({ incidentDate: date }));
    expect(res.body.incidentDate).toBe(date);
  });

  test('SF-103 : déclaration à J+1 non tardive, à J+10 tardive', async () => {
    const onTime = await request.post('/api/public/claims').send(habDeclaration({ incidentDate: isoDaysAgo(1) }));
    const late = await request.post('/api/public/claims').send(habDeclaration({ incidentDate: isoDaysAgo(10) }));
    expect(onTime.body.lateDeclaration).toBe(false);
    expect(late.body.lateDeclaration).toBe(true);
  });

  test('déclaration auto : le véhicule est enregistré dans vehicles', async () => {
    const res = await request.post('/api/public/claims').send({
      contractNumber: 'MA-AUTO-001002',
      email: 'INES.DALMEIDA@example.test',
      type: 'BRIS_DE_GLACE',
      incidentDate: isoDaysAgo(0),
      description: 'Impact de gravillon sur le pare-brise côté passager',
      vehicle: { plate: 'gh-456-jk', brand: 'Peugeot', model: '208' },
    });
    expect(res.status).toBe(201);
    const { rows } = await db.query(
      'SELECT v.plate_number FROM vehicles v JOIN claims c ON c.id = v.claim_id WHERE c.reference = $1',
      [res.body.reference],
    );
    expect(rows[0].plate_number).toBe('GH-456-JK');
  });

  test('déclaration invalide : 400 avec toutes les erreurs', async () => {
    const res = await request.post('/api/public/claims').send(habDeclaration({ type: 'AUTO_VOL', description: 'court' }));
    expect(res.status).toBe(400);
    expect(res.body.details.length).toBeGreaterThanOrEqual(2);
    expect(res.body.stack).toBeUndefined();
  });
});
