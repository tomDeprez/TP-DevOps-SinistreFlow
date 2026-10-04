const { request, backoffice, db } = require('./helpers');

afterAll(() => db.pool.end());

describe('back-office', () => {
  test('authentification obligatoire', async () => {
    expect((await request.get('/api/internal/claims')).status).toBe(401);
  });

  test('SF-108 : recherche d\'un nom avec apostrophe', async () => {
    const res = await backoffice.get(`/api/internal/claims?q=${encodeURIComponent("D'Almeida")}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    res.body.items.forEach((c) => expect(c.holder).toMatch(/D'Almeida/));
  });

  test('SF-108 : une tentative d\'injection SQL ne renvoie rien', async () => {
    const res = await backoffice.get(`/api/internal/claims?q=${encodeURIComponent("%' OR 1=1 --")}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  test('SF-108 : les jokers SQL saisis sont traités comme du texte', async () => {
    const res = await backoffice.get(`/api/internal/claims?q=${encodeURIComponent('%')}`);
    expect(res.body.items).toEqual([]);
  });

  test('SF-107 : la liste back-office affiche bien la première page', async () => {
    const res = await backoffice.get('/api/internal/claims?status=EXPERTISE_EN_COURS');
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  test('SF-105 : un dossier refusé ne peut pas être indemnisé', async () => {
    const { rows } = await db.query("SELECT reference FROM claims WHERE status = 'REFUSE' LIMIT 1");
    const detail = await backoffice.get(`/api/internal/claims/${rows[0].reference}`);
    expect(detail.body.allowedTransitions).toEqual(['CLOS']);

    const res = await backoffice.post(`/api/internal/claims/${rows[0].reference}/transition`).send({ to: 'INDEMNISE' });
    expect(res.status).toBe(409);
  });

  test('changement de statut tracé dans l\'historique', async () => {
    const { rows } = await db.query("SELECT reference FROM claims WHERE status = 'DECLARE' LIMIT 1");
    const res = await backoffice.post(`/api/internal/claims/${rows[0].reference}/transition`).send({ to: 'EN_INSTRUCTION' });
    expect(res.status).toBe(200);
    expect(res.body.internalStatus).toBe('EN_INSTRUCTION');
    expect(res.body.claim.history.at(-1)).toMatchObject({ to: 'UNDER_REVIEW', by: 'gestionnaire:gestionnaire' });
  });
});
