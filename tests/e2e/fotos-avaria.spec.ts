import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ehCelular, entrarComo } from './apoio';
import { conferirDevolucao, esperarEnviada, fotoDeTeste, prepararConferencia } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

/** Prints de conferência visual (só no celular e só com PRINTS_DIR definido). */
async function print(page: Page, celular: boolean, nome: string) {
  const pasta = process.env.PRINTS_DIR;
  if (!pasta || !celular) return;
  await page.screenshot({ path: join(pasta, nome) });
}

async function semRolagemLateral(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('tira 2 fotos da avaria, remove 1 e o detalhe mostra 1 "Extra · Unidade 1"', async ({ page }, testInfo) => {
  const celular = ehCelular(testInfo);
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await conferirDevolucao(page, d.codigo, ['BOM'], {
    aoConferirUnidade: async (p) => {
      await expect(p.getByRole('heading', { name: 'Fotos da avaria (opcional)' })).toBeVisible();
      const adicionar = p.getByLabel('Adicionar foto', { exact: true });
      await adicionar.setInputFiles(await fotoDeTeste('avaria-1.jpg'));
      await esperarEnviada(p, 'Foto da avaria 1');
      await adicionar.setInputFiles(await fotoDeTeste('avaria-2.jpg'));
      await esperarEnviada(p, 'Foto da avaria 2');

      const segunda = p.getByRole('group', { name: 'Foto da avaria 2', exact: true });
      const remover = segunda.getByRole('button', { name: 'Remover' });
      expect((await remover.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await remover.click();
      const confirmar = segunda.getByRole('button', { name: 'Confirmar remoção' });
      await expect(confirmar).toBeVisible();
      expect((await confirmar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
      await semRolagemLateral(p);
      await segunda.scrollIntoViewIfNeeded();
      await print(p, celular, '1-passo-unidade-avaria-segundo-toque.png');

      await confirmar.click();
      await expect(p.getByRole('group', { name: 'Foto da avaria 2', exact: true })).toHaveCount(0);
      await expect(p.getByRole('group', { name: 'Foto da avaria 1', exact: true })).toContainText(/Enviada|Pronta/);
    },
  });

  await expect(page.getByText('Extra · Unidade 1', { exact: true })).toHaveCount(1);
  await semRolagemLateral(page);
  await page.getByText('Extra · Unidade 1', { exact: true }).scrollIntoViewIfNeeded();
  await print(page, celular, '2-detalhe-extra-unidade-1.png');
});
