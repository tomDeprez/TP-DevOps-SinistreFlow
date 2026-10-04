const { request, db } = require('./helpers');

afterAll(() => db.pool.end());

describe('santé et observabilité', () => {
  test('SF-115 : /health vérifie la base de données', async () => {
    const res = await request.get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.checks.database.status).toBe('UP');
  });

  test('SF-115 : /health répond 503 quand la base est injoignable', async () => {
    const spy = jest.spyOn(db, 'query').mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'ECONNREFUSED' }));
    const res = await request.get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('DOWN');
    spy.mockRestore();
  });

  test('/metrics expose les métriques Prometheus', async () => {
    await request.get('/api/v2/claims/X');
    const res = await request.get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('sinistreflow_http_requests_total');
    expect(res.text).toContain('sinistreflow_http_request_duration_seconds_bucket');
    expect(res.text).toContain('sinistreflow_db_pool_connections');
  });

  test('route API inconnue : 404 JSON', async () => {
    const res = await request.get('/api/v9/claims');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Route inconnue/);
  });
});
