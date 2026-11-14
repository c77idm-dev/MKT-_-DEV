import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo, semRolagemLateral } from './apoio';
import { esperarEnviada, fotoDeTeste, prepararConferencia } from './apoio-conferencia';
import { USUARIOS_E2E } from './dados';

test('do detalhe da devolução: "Iniciar conferência" abre a bancada', async ({ page }) => {
  const d = await prepararConferencia();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}`);
  const secao = page.getByRole('region', { name: 'Conferência' });
  await expect(secao).toContainText('Aguardando conferência.');
  await semRolagemLateral(page);
  await secao.getByRole('button', { name: 'Iniciar conferência' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}/conferencia$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Conferência' })).toBeVisible();
});

test('"Conferir pacote" na etapa 2: lê (ou digita) o rastreio e abre a bancada', async ({ page }) => {
  const d = await prepararConferencia();
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/etapa/2');
  await page.getByRole('link', { name: 'Conferir pacote' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Conferir pacote' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ler com a câmera' })).toBeVisible();
  await semRolagemLateral(page);
  await page.getByLabel('Código de Rastreamento ou código DEV').fill(d.rastreio.toLowerCase());
  await page.getByRole('button', { name: 'Abrir conferência' }).click();
  await expect(page).toHaveURL(new RegExp(`/fluxo/devolucoes/${d.codigo}/conferencia$`));
});

test('o Gestor vê quem está conferindo e libera a trava', async ({ page }, testInfo) => {
  test.skip(ehCelular(testInfo), 'ação do Gestor: basta o computador');
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.goto(`/fluxo/devolucoes/${d.codigo}`);
  const secao = page.getByRole('region', { name: 'Conferência' });
  await expect(secao).toContainText(`Em conferência por ${USUARIOS_E2E.operador.nome}`);
  await secao.getByRole('button', { name: 'Liberar trava' }).click();
  await expect(secao).toContainText('Aguardando conferência.');
  await expect(page.getByText('Trava da conferência liberada pelo Gestor')).toBeVisible();
});

test('o worker processa a foto: o detalhe mostra a Foto 1 pronta, aberta por link temporário', async ({ page }, testInfo) => {
  test.skip(ehCelular(testInfo), 'o processamento é o mesmo nos dois projetos; basta o computador');
  const d = await prepararConferencia({ emConferenciaCom: 'operador' });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto(`/fluxo/devolucoes/${d.codigo}/conferencia`);
  await page.waitForLoadState('networkidle'); // hidratação: o onChange precisa existir
  await page.getByLabel('Tirar Foto 1', { exact: true }).setInputFiles(await fotoDeTeste());
  await esperarEnviada(page, 'Foto 1');
  await page.goto(`/fluxo/devolucoes/${d.codigo}`);
  const foto = page.getByRole('img', { name: `Foto 1 da ${d.codigo}` });
  await expect
    .poll(
      async () => {
        await page.reload();
        return foto.count();
      },
      { timeout: 60_000, intervals: [1000, 2000, 3000] },
    )
    .toBe(1);
  const src = await foto.getAttribute('src');
  expect(src).toMatch(/^\/api\/arquivos\?/);
  const resposta = await page.request.get(src!);
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toBe('image/jpeg');
});
