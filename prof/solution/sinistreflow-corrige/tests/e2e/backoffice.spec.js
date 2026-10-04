const { test, expect } = require('@playwright/test');

async function login(page) {
  await page.goto('/backoffice.html');
  await page.getByLabel('Identifiant').fill('gestionnaire');
  await page.getByLabel('Mot de passe').fill('e2e-bo-password');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('heading', { name: 'Dossiers sinistres' })).toBeVisible();
}

test.describe('Back-office gestionnaire', () => {
  test('mauvais mot de passe refusé', async ({ page }) => {
    await page.goto('/backoffice.html');
    await page.getByLabel('Identifiant').fill('gestionnaire');
    await page.getByLabel('Mot de passe').fill('faux');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.locator('#error')).toContainText('Identifiants gestionnaire invalides');
  });

  test('SF-107 : la liste des dossiers en attente d\'expertise n\'est pas vide', async ({ page }) => {
    await login(page);
    await page.locator('#status').selectOption('EXPERTISE_EN_COURS');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await expect(page.locator('#rows tr').first()).toContainText('EXPERTISE_EN_COURS');
  });

  test('SF-108 : recherche par nom avec apostrophe puis ouverture du dossier', async ({ page }) => {
    await login(page);
    await page.getByPlaceholder("Référence, n° de contrat ou nom de l'assuré").fill("D'Almeida");
    await page.getByRole('button', { name: 'Rechercher' }).click();
    const firstRow = page.locator('#rows tr').first();
    await expect(firstRow).toBeVisible();
    await expect(page.locator('#error')).toBeHidden();
    const reference = await firstRow.locator('td').first().textContent();
    await firstRow.click();
    await expect(page.locator('#detail h1')).toHaveText(reference);
  });

  test('SF-105 : un dossier refusé ne propose que la clôture', async ({ page }) => {
    await login(page);
    await page.locator('#status').selectOption('REFUSE');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await page.locator('#rows tr').first().click();
    await expect(page.locator('#transitions button')).toHaveText(['→ CLOS']);
  });
});
