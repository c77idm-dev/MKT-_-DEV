import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { carimbarFoto, escaparXml, svgCarimbo, textoCarimbo } from './carimbo';

const CINZA = { r: 200, g: 200, b: 200 };
const imagem = (largura: number, altura: number) => sharp({ create: { width: largura, height: altura, channels: 3, background: CINZA } });

describe('carimbo (extra, spec §9; decisão 6 mudada pela E28)', () => {
  it('texto: só a data e a hora de Brasília e o código da devolução, sem o nome de quem enviou (E28)', () => {
    expect(textoCarimbo({ quando: new Date('2026-11-12T17:03:00Z'), codigo: 'DEV-000123' })).toBe('12/11/2026 14:03 · DEV-000123');
    // A retirada do Full (melhoria 3) usa o código dela.
    expect(textoCarimbo({ quando: new Date('2026-11-12T17:03:00Z'), codigo: 'RF-000007' })).toBe('12/11/2026 14:03 · RF-000007');
  });

  it('escapa o XML do texto do carimbo', () => {
    expect(escaparXml(`<b>"Zé" & 'Cia'</b>`)).toBe('&lt;b&gt;&quot;Zé&quot; &amp; &apos;Cia&apos;&lt;/b&gt;');
    expect(svgCarimbo(800, 600, 'A & B')).toContain('A &amp; B');
  });

  it('grava uma faixa escura embaixo, mantém o tamanho e tira o EXIF', async () => {
    const entrada = await imagem(800, 600).jpeg().toBuffer();
    const { conteudo, largura, altura } = await carimbarFoto(entrada, { quando: new Date(), codigo: 'DEV-000001' });
    const info = await sharp(conteudo).metadata();
    expect([info.format, info.width, info.height, largura, altura]).toEqual(['jpeg', 800, 600, 800, 600]);
    expect(info.exif).toBeUndefined();
    // stats() ignora extract() nesta versão do sharp: recorta para um buffer e mede o recorte.
    const media = async (top: number) =>
      sharp(await sharp(conteudo).extract({ left: 0, top, width: 50, height: 8 }).png().toBuffer()).stats();
    const baixo = await media(590);
    const alto = await media(10);
    expect(baixo.channels[0].mean).toBeLessThan(alto.channels[0].mean - 50);
  });

  it('aplica a orientação do celular e limita o maior lado a 1600 px', async () => {
    const deitada = await imagem(800, 600).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const girada = await carimbarFoto(deitada, { quando: new Date(), codigo: 'DEV-1' });
    expect([girada.largura, girada.altura]).toEqual([600, 800]);
    const grande = await imagem(4000, 3000).jpeg().toBuffer();
    const reduzida = await carimbarFoto(grande, { quando: new Date(), codigo: 'DEV-1' });
    expect([reduzida.largura, reduzida.altura]).toEqual([1600, 1200]);
  });

  it('recusa o que não é imagem', async () => {
    await expect(carimbarFoto(Buffer.from('não é imagem'), { quando: new Date(), codigo: 'DEV-1' })).rejects.toThrow();
  });
});
