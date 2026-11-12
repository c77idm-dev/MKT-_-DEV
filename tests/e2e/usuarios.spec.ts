import { expect, test } from '@playwright/test';
import { entrarComo, semRolagemLateral } from './apoio';
import { USUARIOS_E2E } from './dados';

test('gestor cria, desativa, reativa e muda o perfil de um usuário; desativar encerra a sessão na hora', async ({ page, browser }, testInfo) => {
  // O banco do e2e é o mesmo para o computador e o celular: um usuário por projeto.
  const email = `carla-${testInfo.project.name}@teste.local`;
  const nome = `Carla Conferente ${testInfo.project.name}`;
  const senha = 'senha-carla-123';

  await entrarComo(page, USUARIOS_E2E.gestor);
  await page.getByRole('navigation', { name: 'Seções' }).getByRole('link', { name: 'Configurações' }).click();
  await page.getByRole('link', { name: /^Usuários/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Usuários' })).toBeVisible();
  await semRolagemLateral(page);

  // Campos: e-mail com teclado de e-mail, senha mascarada e sem preenchimento automático de senha antiga.
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveAttribute('type', 'email');
  await expect(page.getByLabel('E-mail', { exact: true })).toHaveAttribute('autocomplete', 'off');
  await expect(page.getByLabel('Senha inicial')).toHaveAttribute('type', 'password');
  await expect(page.getByLabel('Senha inicial')).toHaveAttribute('autocomplete', 'new-password');

  // O próprio Gestor aparece na lista, mas sem ações (não se rebaixa nem se desativa).
  const cartaoGestor = page.getByRole('listitem').filter({ hasText: USUARIOS_E2E.gestor.email });
  await expect(cartaoGestor).toContainText('(você)');
  await expect(cartaoGestor.getByRole('button')).toHaveCount(0);

  await page.getByLabel('Nome', { exact: true }).fill(nome);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Perfil', { exact: true }).selectOption('OPERADOR');
  await page.getByLabel('Senha inicial').fill(senha);
  await page.getByRole('button', { name: 'Criar usuário' }).click();
  await expect(page.getByRole('status')).toHaveText(`Usuário ${nome} criado.`);
  const cartao = page.getByRole('listitem').filter({ hasText: email });
  await expect(cartao).toContainText('Operador · Ativo');
  await semRolagemLateral(page);

  // Os botões do cartão têm pelo menos 44 px de altura.
  for (const botao of await cartao.getByRole('button').all()) {
    expect((await botao.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }

  // E-mail repetido: o erro aparece e leva o foco; o que foi digitado fica.
  await page.getByLabel('Nome', { exact: true }).fill('Outra Carla');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha inicial').fill(senha);
  await page.getByRole('button', { name: 'Criar usuário' }).click();
  await expect(page.locator('#erros-formulario')).toContainText('Já existe um usuário com o e-mail');
  await expect(page.locator('#erros-formulario')).toBeFocused();
  await expect(page.getByLabel('Nome', { exact: true })).toHaveValue('Outra Carla');

  const contexto = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const paginaCarla = await contexto.newPage();
  await entrarComo(paginaCarla, { email, senha });

  await cartao.getByRole('button', { name: `Desativar ${nome}` }).click();
  await expect(cartao).toContainText('Operador · Desativado');
  await paginaCarla.goto('/fluxo');
  await expect(paginaCarla).toHaveURL(/\/login$/);

  await cartao.getByRole('button', { name: `Reativar ${nome}` }).click();
  await expect(cartao).toContainText('Operador · Ativo');
  await entrarComo(paginaCarla, { email, senha });

  await cartao.getByLabel(`Perfil de ${nome}`, { exact: true }).selectOption('FISCAL');
  await cartao.getByRole('button', { name: `Salvar perfil de ${nome}` }).click();
  await expect(cartao).toContainText('Fiscal · Ativo');
  await paginaCarla.reload();
  await expect(paginaCarla.getByRole('navigation', { name: 'Seções' }).getByRole('link')).toHaveText([
    'Fluxo',
    'Lotes e Remessas',
    'Produtos e Fornecedores',
  ]);
  await contexto.close();
});
