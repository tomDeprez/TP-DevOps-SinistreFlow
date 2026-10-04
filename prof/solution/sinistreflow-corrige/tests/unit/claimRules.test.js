process.env.TZ = 'Europe/Paris';

const { validateDeclaration, isLateDeclaration } = require('../../src/domain/claimRules');

const NOW = new Date(2026, 9, 4, 10, 0); // 04/10/2026 10:00
const AUTO = { id: 1, contract_number: 'MA-AUTO-001001', product: 'AUTO', status: 'ACTIF' };
const HAB = { id: 2, contract_number: 'MA-HAB-002001', product: 'HABITATION', status: 'ACTIF' };

const autoInput = (overrides = {}) => ({
  type: 'AUTO_COLLISION',
  incidentDate: '2026-10-02',
  description: 'Accrochage sur le parking, pare-choc arrière enfoncé',
  vehicle: { plate: 'ab-123-cd', brand: 'Renault', model: 'Clio' },
  estimatedAmount: '1 250,50',
  ...overrides,
});

function errorsOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.details;
  }
  throw new Error('une ValidationError était attendue');
}

describe('validateDeclaration', () => {
  test('déclaration auto valide et normalisée', () => {
    const claim = validateDeclaration(autoInput(), AUTO, NOW);
    expect(claim).toMatchObject({
      contractId: 1,
      type: 'AUTO_COLLISION',
      incidentDate: '2026-10-02',
      vehicle: { plate: 'AB-123-CD', brand: 'Renault', model: 'Clio' },
      estimatedAmountCents: 125050,
      lateDeclaration: false,
    });
  });

  test('SF-102 : un sinistre récent n\'est pas refusé comme "futur"', () => {
    expect(() => validateDeclaration(autoInput({ incidentDate: '2026-09-30' }), AUTO, NOW)).not.toThrow();
  });

  test('refuse un sinistre dans le futur', () => {
    expect(errorsOf(() => validateDeclaration(autoInput({ incidentDate: '2026-10-05' }), AUTO, NOW)))
      .toContain('La date du sinistre ne peut pas être dans le futur');
  });

  test('refuse un contrat non actif', () => {
    expect(errorsOf(() => validateDeclaration(autoInput(), { ...AUTO, status: 'RESILIE' }, NOW))[0])
      .toMatch(/n'est pas actif/);
  });

  test('refuse un type non couvert par le produit', () => {
    expect(errorsOf(() => validateDeclaration(autoInput({ type: 'INCENDIE' }), AUTO, NOW))[0])
      .toMatch(/non couvert/);
  });

  test('immatriculation obligatoire et au bon format', () => {
    expect(errorsOf(() => validateDeclaration(autoInput({ vehicle: { plate: '1234 AB 38' } }), AUTO, NOW)))
      .toContain('Immatriculation invalide (format AA-123-AA)');
  });

  test('numéro de plainte obligatoire pour un cambriolage', () => {
    const input = { type: 'CAMBRIOLAGE', incidentDate: '2026-10-03', description: 'Porte fracturée, télévision volée' };
    expect(errorsOf(() => validateDeclaration(input, HAB, NOW)))
      .toContain('Le numéro de dépôt de plainte est obligatoire pour un vol');
    expect(validateDeclaration({ ...input, complaintNumber: 'PV-2026-00042' }, HAB, NOW).complaintNumber).toBe('PV-2026-00042');
  });

  test('nom du tiers obligatoire si un tiers est impliqué', () => {
    expect(errorsOf(() => validateDeclaration(autoInput({ thirdParty: { involved: true } }), AUTO, NOW)))
      .toContain('Le nom du tiers impliqué est obligatoire');
  });

  test('description trop courte', () => {
    expect(errorsOf(() => validateDeclaration(autoInput({ description: 'choc' }), AUTO, NOW)))
      .toContain('La description doit faire au moins 20 caractères');
  });

  test('cumule toutes les erreurs', () => {
    expect(errorsOf(() => validateDeclaration({ type: 'X' }, AUTO, NOW)).length).toBeGreaterThanOrEqual(4);
  });
});

describe('isLateDeclaration (SF-103)', () => {
  test('dégât des eaux déclaré à J+2 : dans les délais', () => {
    expect(isLateDeclaration('DEGAT_DES_EAUX', '2026-10-02', NOW)).toBe(false);
  });

  test('dégât des eaux déclaré à J+5 : dans les délais', () => {
    expect(isLateDeclaration('DEGAT_DES_EAUX', '2026-09-29', NOW)).toBe(false);
  });

  test('dégât des eaux déclaré à J+6 : tardif', () => {
    expect(isLateDeclaration('DEGAT_DES_EAUX', '2026-09-28', NOW)).toBe(true);
  });

  test('vol déclaré à J+3 : tardif (délai 2 jours)', () => {
    expect(isLateDeclaration('AUTO_VOL', '2026-10-01', NOW)).toBe(true);
  });

  test('vol déclaré à J+2 : dans les délais', () => {
    expect(isLateDeclaration('AUTO_VOL', '2026-10-02', NOW)).toBe(false);
  });
});
