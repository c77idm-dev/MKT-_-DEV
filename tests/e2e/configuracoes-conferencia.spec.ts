import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('o Gestor muda a obrigatoriedade do vídeo e o prazo de guarda, e vê o armazenamento', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/conferencia');
  await expect(page.getByRole('heading', { level: 1, name: 'Conferência e mídias' })).toBeVisible();
  await expect(page.getByText('Disco do servidor', { exact: true })).toBeVisible();
  await semRolagemLateral(page);

  await page.getByLabel(/^Só quando alguma unidade/).check();
  await page.getByLabel('Prazo de guarda das mídias (meses)').fill('6');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuração salva.' })).toBeFocused();
  await page.reload();
  await expect(page.getByLabel(/^Só quando alguma unidade/)).toBeChecked();
  await expect(page.getByLabel('Prazo de guarda das mídias (meses)')).toHaveValue('6');

  // Volta ao padrão: os outros testes da conferência contam com "Sempre".
  await page.getByLabel('Sempre').check();
  await page.getByLabel('Prazo de guarda das mídias (meses)').fill('12');
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Configuração salva.' })).toBeVisible();
});

test('valor inválido mostra o erro com o foco nele', async ({ page }) => {
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto('/configuracoes/conferencia');
  await page.getByLabel('Prazo de guarda das mídias (meses)').fill('500');
  await page.getByRole('button', { name: 'Salvar' }).click();
  const alerta = page.getByRole('alert').filter({ hasText: 'Prazo de guarda' });
  await expect(alerta).toContainText('Prazo de guarda: de 1 a 120 meses.');
  await expect(alerta).toBeFocused();
});
