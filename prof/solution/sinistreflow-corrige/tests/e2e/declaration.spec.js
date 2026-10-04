const { test, expect } = require('@playwright/test');

const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const frDate = (iso) => iso.split('-').reverse().join('/');

async function identify(page, contractNumber, email) {
  await page.goto('/');
  await page.getByLabel('Numéro de contrat').fill(contractNumber);
  await page.getByLabel('Adresse email').fill(email);
  await page.getByTestId('next-1').click();
}

test.describe('Déclaration de sinistre en ligne', () => {
  test('parcours complet : accident auto (email saisi en minuscules, montant à la française)', async ({ page }) => {
    const date = isoDaysAgo(2);
    // SF-112 : l'email est stocké "Camille.Durand@Example.test"
    await identify(page, 'MA-AUTO-001001', 'camille.durand@example.test');
    await expect(page.getByText('Bonjour Camille')).toBeVisible();

    await page.getByLabel('Type de sinistre').selectOption('AUTO_COLLISION');
    await page.getByLabel('Date du sinistre').fill(date);
    await page.getByLabel('Lieu du sinistre').fill('Parking de la gare, Grenoble');
    await page.getByLabel('Immatriculation').fill('fg-321-hj');
    await page.getByLabel('Marque').fill('Renault');
    await page.getByLabel('Modèle').fill('Clio');
    await page.getByTestId('next-2').click();

    await page.getByLabel('Décrivez les circonstances').fill('Accrochage en marche arrière, pare-choc arrière enfoncé.');
    await page.getByLabel('Un tiers est impliqué').check();
    await page.getByLabel('Nom du tiers').fill('Jean Martin');
    await page.getByLabel('Assureur du tiers').fill('MAAF');
    await page.getByTestId('next-3').click();

    await page.getByLabel('Montant estimé des dommages').fill('1 250,50'); // SF-113
    await expect(page.locator('#recap')).toContainText('FG-321-HJ');
    await page.getByLabel("Je certifie l'exactitude").check();
    await page.getByTestId('submit').click();

    const confirmation = page.getByTestId('confirmation');
    await expect(confirmation).toBeVisible();
    await expect(page.getByTestId('reference')).toHaveText(/^SIN-\d{4}-\d{6}$/); // SF-104 : pas d'erreur de doublon
    await expect(confirmation).toContainText(frDate(date)); // SF-111 : pas de décalage d'un jour
    await expect(confirmation).toContainText(/1\s?250,50\s?€/);
    await expect(page.locator('#late-warning')).toBeHidden();
  });

  test('SF-301 : déclaration d\'un cambriolage avec numéro de plainte', async ({ page }) => {
    await identify(page, 'MA-HAB-002001', 'lucas.bernard@example.test');
    await page.getByLabel('Type de sinistre').selectOption('CAMBRIOLAGE');
    await page.getByLabel('Date du sinistre').fill(isoDaysAgo(1));
    await page.getByTestId('next-2').click();

    await expect(page.getByLabel('Numéro de dépôt de plainte')).toBeVisible();
    await page.getByLabel('Décrivez les circonstances').fill('Porte d\'entrée fracturée, ordinateur portable volé.');
    await page.getByLabel('Numéro de dépôt de plainte').fill('PV-2026-04242');
    await page.getByTestId('next-3').click();
    await page.getByLabel("Je certifie l'exactitude").check();
    await page.getByTestId('submit').click();

    await expect(page.getByTestId('confirmation')).toBeVisible();
    await expect(page.getByTestId('error')).toBeHidden();
  });

  test('déclaration tardive signalée à l\'assuré', async ({ page }) => {
    await identify(page, 'MA-HAB-002001', 'lucas.bernard@example.test');
    await page.getByLabel('Type de sinistre').selectOption('DEGAT_DES_EAUX');
    await page.getByLabel('Date du sinistre').fill(isoDaysAgo(12));
    await page.getByTestId('next-2').click();
    await page.getByLabel('Décrivez les circonstances').fill('Infiltration par la toiture découverte au retour de vacances.');
    await page.getByTestId('next-3').click();
    await page.getByLabel("Je certifie l'exactitude").check();
    await page.getByTestId('submit').click();
    await expect(page.locator('#late-warning')).toBeVisible();
  });

  test('un contrat résilié est refusé dès l\'identification', async ({ page }) => {
    await identify(page, 'MA-AUTO-001060', 'lucas.bernard@example.test');
    await expect(page.getByTestId('error')).toContainText("n'est plus actif");
  });

  test('erreurs de validation affichées sans quitter le formulaire', async ({ page }) => {
    await identify(page, 'MA-AUTO-001002', 'ines.dalmeida@example.test');
    await page.getByLabel('Type de sinistre').selectOption('BRIS_DE_GLACE');
    await page.getByLabel('Date du sinistre').fill(isoDaysAgo(0));
    await page.getByLabel('Immatriculation').fill('pas une plaque');
    await page.getByTestId('next-2').click();
    await page.getByLabel('Décrivez les circonstances').fill('Pare-brise fissuré par un gravillon sur l\'autoroute.');
    await page.getByTestId('next-3').click();
    await page.getByLabel("Je certifie l'exactitude").check();
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('error')).toContainText('Immatriculation invalide');
    await expect(page.getByTestId('submit')).toBeEnabled();
  });
});
