import { expect, test } from '@playwright/test';
import { ehCelular, entrarComo } from './apoio';
import { USUARIOS_E2E } from './dados';

test.use({ permissions: ['camera'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } });

test('abre a câmera em tela cheia e "Fechar câmera" desliga todas as trilhas', async ({ page }, testInfo) => {
  test.skip(ehCelular(testInfo), 'o mesmo código roda nos dois projetos; basta o computador');
  await page.addInitScript(() => {
    const abertos: MediaStream[] = [];
    (window as unknown as { __fluxos: MediaStream[] }).__fluxos = abertos;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (restricoes) => {
      const fluxo = await original(restricoes);
      abertos.push(fluxo);
      return fluxo;
    };
  });
  await entrarComo(page, USUARIOS_E2E.operador);
  await page.goto('/fluxo/recebimento');
  await page.getByRole('button', { name: 'Ler com a câmera' }).click();
  const fechar = page.getByRole('button', { name: 'Fechar câmera' });
  await expect(fechar).toBeVisible();
  // Acessibilidade: o foco vai para "Fechar câmera" e o resto da página fica atrás de um diálogo modal.
  await expect(fechar).toBeFocused();
  await expect(page.getByRole('dialog', { name: 'Leitor de código pela câmera' })).toBeVisible();
  await expect(page.getByLabel('Imagem da câmera')).toBeVisible();
  expect((await fechar.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __fluxos: MediaStream[] }).__fluxos.length)).toBe(1);
  await fechar.click();
  await expect(page.getByRole('button', { name: 'Ler com a câmera' })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const estados = await page.evaluate(() =>
    (window as unknown as { __fluxos: MediaStream[] }).__fluxos.flatMap((f) => f.getTracks().map((t) => t.readyState)),
  );
  expect(estados.length).toBeGreaterThan(0);
  expect(estados.every((e) => e === 'ended')).toBe(true);
});
