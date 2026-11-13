import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { expect, test } from '@playwright/test';
import { ArmazenamentoDisco } from '../../src/modules/midia/armazenamento-disco';
import { codigoUnico, ehCelular, entrarComo } from './apoio';
import { AMBIENTE_E2E, URL_E2E, USUARIOS_E2E } from './dados';

test('link temporário do disco: com login abre, com Range devolve um pedaço, adulterado ou sem login é recusado', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(ehCelular(testInfo), 'a rota é a mesma nos dois projetos; basta o computador');
  // O mesmo disco e o mesmo segredo do servidor do e2e (AMBIENTE_E2E).
  const disco = new ArmazenamentoDisco(resolve(AMBIENTE_E2E.MIDIA_DIR), AMBIENTE_E2E.SEGREDO_LINKS);
  const chave = `testes/${codigoUnico('ARQ')}.txt`;
  await disco.salvar(chave, Readable.from([Buffer.from('conteudo-de-teste')]));
  try {
    const url = await disco.urlTemporaria(chave, 600);

    await entrarComo(page, USUARIOS_E2E.fiscal);
    const inteiro = await page.request.get(url);
    expect(inteiro.status()).toBe(200);
    expect(await inteiro.text()).toBe('conteudo-de-teste');
    expect(inteiro.headers()['cache-control']).toBe('private, no-store');
    expect(inteiro.headers()['content-security-policy']).toBe("sandbox; default-src 'none'");
    expect(inteiro.headers()['content-disposition']).toBe('attachment'); // .txt não é exibível na origem do app

    const pedaco = await page.request.get(url, { headers: { range: 'bytes=0-7' } });
    expect(pedaco.status()).toBe(206);
    expect(await pedaco.text()).toBe('conteudo');
    expect(pedaco.headers()['content-range']).toBe('bytes 0-7/17');

    expect((await page.request.get(url.replace(/sig=[^&]+/, 'sig=adulterado'))).status()).toBe(403);

    expect((await page.request.get(url, { headers: { range: 'bytes=999999-' } })).status()).toBe(416);
    const malformado = await page.request.get(url, { headers: { range: 'bytes=a-b' } });
    expect(malformado.status()).toBe(200);
    expect(await malformado.text()).toBe('conteudo-de-teste');

    const anonimo = await browser.newContext();
    try {
      expect((await anonimo.request.get(new URL(url, URL_E2E).toString())).status()).toBe(401);
    } finally {
      await anonimo.close();
    }

    // Link vencido (assinado com o mesmo segredo, prazo no passado): 410.
    const vencido = await disco.urlTemporaria(chave, -60);
    expect((await page.request.get(vencido)).status()).toBe(410);
  } finally {
    await disco.apagar(chave);
  }
});
