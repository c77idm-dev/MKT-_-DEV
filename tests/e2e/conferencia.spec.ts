import { asc, eq } from 'drizzle-orm';
import { expect, test } from '@playwright/test';
import { evidencias, itensDevolucao } from '../../src/db/schema';
import { comBanco, entrarComo, paginaNaoEncontrada, semRolagemLateral } from './apoio';
import { conferirDevolucao, EAN_TESTE, esperarEnviada, fotoDeTeste, prepararConferencia, videoDeTeste } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

test('conferência completa: fotos, EAN, unidade ausente, Vídeo de Prova, destino e conclusão', async ({ page }) => {
  const d = await prepararConferencia({ unidades: 2, emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await expect(page.getByRole('heading', { level: 1, name: 'Conferência' })).toBeVisible();
  await expect(page.getByText('Passo 1 de 5:')).toBeVisible();
  await semRolagemLateral(page);

  // Pacote: Fotos 1 e 2 (a "câmera" entrega um JPEG; o celular comprime e envia pelo tus).
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste('foto-1.jpg'));
  await page.getByLabel('Tirar Foto 2', { exact: true }).setInputFiles(await fotoDeTeste('foto-2.jpg'));
  await esperarEnviada(page, 'Foto 1');
  await esperarEnviada(page, 'Foto 2');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Unidade 1: EAN confere, Fotos 3 e 4, S/N.
  await expect(page.getByText('Passo 2 de 5:')).toBeVisible();
  await page.getByLabel('EAN lido').fill(EAN_TESTE);
  await page.getByRole('button', { name: 'Conferir', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Confere com o esperado.' })).toBeVisible();
  await page.getByLabel('Tirar Foto 3', { exact: true }).setInputFiles(await fotoDeTeste('foto-3.jpg'));
  await page.getByLabel('Tirar Foto 4', { exact: true }).setInputFiles(await fotoDeTeste('foto-4.jpg'));
  await page.getByLabel('Nº de série (S/N)').fill('SN-E2E-1');
  await esperarEnviada(page, 'Foto 3');
  await esperarEnviada(page, 'Foto 4');
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Unidade 2: não veio no pacote.
  await expect(page.getByText('Passo 3 de 5:')).toBeVisible();
  await page.getByRole('button', { name: 'Não veio no pacote (ausente)' }).click();
  await expect(page.getByText('Unidade marcada como ausente')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Vídeo de Prova: "Escolher arquivo" (o setInputFiles faz o papel da câmera).
  await page.getByLabel('Escolher arquivo de vídeo').setInputFiles(videoDeTeste());
  await esperarEnviada(page, 'Vídeo de Prova');
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Destino.
  await expect(page.getByText('Passo 5 de 5:')).toBeVisible();
  const unidade1 = page.getByRole('group', { name: /^Unidade 1/ });
  await unidade1.getByLabel('Estoque Problema').check();
  await page.getByLabel('Motivo da unidade 1').selectOption('AVARIADO');
  await expect(page.getByText('Tudo pronto para concluir.')).toBeVisible();
  await semRolagemLateral(page);
  await page.getByRole('button', { name: 'Concluir conferência' }).click();

  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}$`));
  await expect(page.getByText('Aguardando NF').first()).toBeVisible();
  const itens = await comBanco((db) =>
    db
      .select({ status: itensDevolucao.status, destino: itensDevolucao.destino, motivo: itensDevolucao.motivo, serial: itensDevolucao.serial })
      .from(itensDevolucao)
      .where(eq(itensDevolucao.devolucaoId, d.id))
      .orderBy(asc(itensDevolucao.unidade)),
  );
  expect(itens).toEqual([
    { status: 'AGUARDANDO_NF', destino: 'PROBLEMA', motivo: 'AVARIADO', serial: 'SN-E2E-1' },
    { status: 'AUSENTE', destino: null, motivo: 'AUSENTE', serial: null },
  ]);
});

test('sem internet a foto fica guardada no aparelho e sobe quando a conexão volta (spec §9)', async ({ page, context }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await expect(page.getByLabel('Tirar Foto 1', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste());
  await expect(page.getByRole('group', { name: 'Foto 1', exact: true })).toContainText('Aguardando conexão', { timeout: 30_000 });
  await context.setOffline(false);
  await esperarEnviada(page, 'Foto 1');
  const salvas = await comBanco((db) => db.select({ id: evidencias.id }).from(evidencias).where(eq(evidencias.devolucaoId, d.id)));
  expect(salvas).toHaveLength(1);
});

test('concluir cedo mostra o que falta, com o foco na lista', async ({ page }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia?passo=3`);
  await page.getByRole('button', { name: 'Concluir conferência' }).click();
  const erros = page.locator('#erros-conferencia');
  await expect(erros).toContainText('Falta: Foto 1 (etiqueta de rastreio e declaração de conteúdo)');
  await expect(erros).toContainText('Falta: Destino da unidade 1');
  await expect(erros).toBeFocused();
});

test('desistir volta para Aguardando conferência e mantém o que foi feito', async ({ page }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia?passo=1`);
  await page.getByLabel('Nº de série (S/N)').fill('SN-DESISTE');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Desistir da conferência' }).click();
  await page.getByRole('button', { name: 'Confirmar desistência' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}$`));
  await expect(page.getByText('Aguardando conferência').first()).toBeVisible();
  const [item] = await comBanco((db) => db.select({ serial: itensDevolucao.serial }).from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, d.id)));
  expect(item.serial).toBe('SN-DESISTE');
});

test('só quem está com a trava abre a conferência; o Fiscal nem vê a tela', async ({ page }) => {
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}$`));
  await page.context().clearCookies();
  await entrarComo(page, USUARIOS_E2E.fiscal);
  await paginaNaoEncontrada(page, `/fluxo/devolucoes/${d.codigo}/conferencia`);
});

test('conferirDevolucao (apoio das integrações das Fases 3 e 4) conclui pela tela', async ({ page }) => {
  const d = await prepararConferencia({ unidades: 3 });
  await entrarComo(page, USUARIOS_E2E.operador);
  await conferirDevolucao(page, d.codigo, ['BOM', { problema: 'AVARIADO' }, 'AUSENTE']);
  const itens = await comBanco((db) =>
    db
      .select({ status: itensDevolucao.status, destino: itensDevolucao.destino, motivo: itensDevolucao.motivo })
      .from(itensDevolucao)
      .where(eq(itensDevolucao.devolucaoId, d.id))
      .orderBy(asc(itensDevolucao.unidade)),
  );
  expect(itens).toEqual([
    { status: 'AGUARDANDO_NF', destino: 'BOM', motivo: null },
    { status: 'AGUARDANDO_NF', destino: 'PROBLEMA', motivo: 'AVARIADO' },
    { status: 'AUSENTE', destino: null, motivo: 'AUSENTE' },
  ]);
});
