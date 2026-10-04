const { STATUSES, TRANSITIONS, canTransition, assertTransition } = require('../../src/domain/workflow');

describe('workflow des dossiers', () => {
  test('un dossier déclaré peut passer en instruction', () => {
    expect(canTransition('DECLARE', 'EN_INSTRUCTION')).toBe(true);
  });

  // SF-105 : l'ancien test validait le bug ("geste commercial") - règle confirmée par le métier :
  // un dossier refusé ne peut QUE être clos. Un geste commercial passe par un nouveau dossier.
  test('SF-105 : un dossier refusé ne peut pas être indemnisé', () => {
    expect(canTransition('REFUSE', 'INDEMNISE')).toBe(false);
    expect(() => assertTransition('REFUSE', 'INDEMNISE')).toThrow('Transition interdite');
  });

  test('un dossier refusé peut être clos', () => {
    expect(canTransition('REFUSE', 'CLOS')).toBe(true);
  });

  test('seul un dossier accepté peut être indemnisé', () => {
    const sources = STATUSES.filter((s) => canTransition(s, 'INDEMNISE'));
    expect(sources).toEqual(['ACCEPTE']);
  });

  test('un dossier clos ne bouge plus', () => {
    expect(TRANSITIONS.CLOS).toEqual([]);
    expect(() => assertTransition('CLOS', 'EN_INSTRUCTION')).toThrow('Transition interdite');
  });

  test('un statut inconnu est refusé', () => {
    expect(() => assertTransition('DECLARE', 'PAYE')).toThrow('Statut inconnu');
  });

  test('toutes les transitions pointent vers des statuts existants', () => {
    Object.values(TRANSITIONS).flat().forEach((to) => expect(STATUSES).toContain(to));
  });

  test('le parcours nominal complet est possible', () => {
    const path = ['DECLARE', 'EN_INSTRUCTION', 'EXPERTISE_EN_COURS', 'EXPERTISE_TERMINEE', 'ACCEPTE', 'INDEMNISE', 'CLOS'];
    for (let i = 1; i < path.length; i++) {
      expect(canTransition(path[i - 1], path[i])).toBe(true);
    }
  });
});
