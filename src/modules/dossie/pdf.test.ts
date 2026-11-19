import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { imagensDoPdf, paginasDoPdf, textoDoPdf } from '../../../tests/helpers/pdf';
import { dadosDossieTeste as dadosTeste } from '../../../tests/helpers/fabricas-dossie';
import type { OpcoesImagem } from './dominio';
import { reduzirImagem, type ImagemPdf } from './imagens';
import { gerarPdfDossie, type MidiasDossie } from './pdf';

/** Uma foto 2000×1500 reduzida pelo reduzirImagem de verdade, uma vez por tamanho (o mozjpeg é lento). */
const reduzidas = new Map<string, Promise<ImagemPdf>>();
function fotoReduzida(opcoes: OpcoesImagem): Promise<ImagemPdf> {
  const chave = `${opcoes.ladoMaior}/${opcoes.qualidade}`;
  if (!reduzidas.has(chave)) {
    const base = sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 90, g: 140, b: 120 } } }).jpeg().toBuffer();
    reduzidas.set(chave, base.then((b) => reduzirImagem(b, opcoes)));
  }
  return reduzidas.get(chave)!;
}

function midiasTeste(o: { fotoFalha?: string[]; semQuadro?: boolean } = {}): MidiasDossie & { chamadas: { id: string; opcoes: OpcoesImagem }[] } {
  const chamadas: { id: string; opcoes: OpcoesImagem }[] = [];
  return {
    chamadas,
    async foto(e, opcoes) {
      chamadas.push({ id: e.id, opcoes });
      if (o.fotoFalha?.includes(e.id)) return { ok: false, motivo: 'Arquivo não encontrado no armazenamento.' };
      return { ok: true, imagem: await fotoReduzida(opcoes), sha256Calculado: e.sha256Final ? null : 'c'.repeat(64) };
    },
    async quadroDoVideo(_e, opcoes) {
      chamadas.push({ id: 'quadro', opcoes });
      if (o.semQuadro) return { imagem: null, duracaoSegundos: null, sha256Calculado: null, problema: 'Não foi possível tirar um quadro do vídeo.' };
      return { imagem: await fotoReduzida(opcoes), duracaoSegundos: 42.4, sha256Calculado: null, problema: null };
    },
  };
}

describe('gerarPdfDossie (extra)', () => {
  it('gera um PDF válido, com as seções em ordem, cada uma começando numa página', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    expect(Buffer.from(r.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(r.tamanho).toBe(r.bytes.length);
    const doc = await PDFDocument.load(r.bytes);
    expect(doc.getTitle()).toBe('Dossiê de provas DEV-000123');
    expect(doc.getPageCount()).toBe(r.paginas);
    expect(r.secoes.map((s) => s.titulo)).toEqual([
      'Dossiê de provas',
      'Pacote',
      'Unidade 1 de 3',
      'Unidade 2 de 3',
      'Unidade 3 de 3',
      'Vídeo de Prova',
      'Histórico',
      'Integridade dos arquivos',
    ]);
    const paginasDasSecoes = r.secoes.map((s) => s.pagina);
    expect(paginasDasSecoes[0]).toBe(1);
    for (let i = 1; i < paginasDasSecoes.length; i++) expect(paginasDasSecoes[i]).toBeGreaterThan(paginasDasSecoes[i - 1]);
    const paginas = await paginasDoPdf(r.bytes);
    for (const s of r.secoes) expect(paginas[s.pagina - 1]).toContain(s.titulo);
    // Rodapé em todas as páginas: código, quem gerou e a numeração.
    paginas.forEach((p, i) => {
      expect(p).toContain(`Página ${i + 1} de ${r.paginas}`);
      expect(p).toContain('DEV-000123 · Dossiê de provas · gerado em 19/11/2026 15:30 por Gestora Teste');
    });
    // Índice na capa.
    expect(paginas[0]).toContain('Conteúdo');
    expect(paginas[0]).toContain(`página ${r.secoes[1].pagina}`);
  });

  it('escreve os acentos do pt-BR (WinAnsi), sem trocar letras por "?"', async () => {
    const texto = await textoDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    for (const trecho of ['Dossiê de provas', 'Código de rastreamento', 'Conferência concluída', 'Não veio no pacote (ausente)', 'Vídeo de Prova', 'Fone Bluetooth Ação']) {
      expect(texto).toContain(trecho);
    }
    expect(texto).not.toMatch(/\p{L}\?\p{L}/u);
  });

  it('capa: canal, venda e reclamação do ML, rastreio, motivos, chegada e conferência', async () => {
    const [capa] = await paginasDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    for (const trecho of [
      'Loja Exemplo Ltda',
      'Gestão de Devoluções',
      'DEV-000123',
      'Mercado Livre',
      '2000009876543210',
      '5300000001',
      '91000001',
      'Loja Falsa 1',
      'BR123456789',
      'Correios',
      'Motivo do cliente',
      'Produto não funciona',
      'Motivo da reclamação no ML',
      'Chegou com defeito (PDD9949)',
      '19/11/2026 10:00',
      'Recebedor Teste',
      'Início da conferência',
      '19/11/2026 10:01',
      'Fim da conferência',
      '19/11/2026 10:20',
      'Conferente Teste',
    ]) {
      expect(capa).toContain(trecho);
    }
  });

  it('capa de devolução fora do ML: sem os campos do ML', async () => {
    const [capa] = await paginasDoPdf(
      (await gerarPdfDossie(dadosTeste({ canal: 'SHOPEE', reclamacaoId: null, devolucaoExternaId: null, contaML: null, motivoReclamacaoML: null }), midiasTeste())).bytes,
    );
    expect(capa).toContain('Shopee');
    expect(capa).toContain('Número do pedido');
    expect(capa).not.toContain('Motivo da reclamação no ML');
  });

  it('cada unidade: produto esperado, leitura do código, S/N, lote, validade, destino, observação e as fotos', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const daSecao = (titulo: string) => {
      const i = r.secoes.findIndex((s) => s.titulo === titulo);
      return paginas.slice(r.secoes[i].pagina - 1, r.secoes[i + 1].pagina - 1).join('\n');
    };
    const u1 = daSecao('Unidade 1 de 3');
    for (const trecho of [
      'FONE-01', 'Fone Bluetooth Ação', '7891000000014', 'Confere', 'SN-ABC-1', 'L2026', '12/2027',
      'Estoque Problema · Avariado', 'Caixa amassada e tela trincada.', 'Foto 3', 'Foto 4', 'Fotos da avaria', 'Foto da avaria 1', 'Foto da avaria 2',
    ]) {
      expect(u1).toContain(trecho);
    }
    const u2 = daSecao('Unidade 2 de 3');
    expect(u2).toContain('Não confere');
    expect(u2).toContain('CAPA-09 · Capa de silicone');
    expect(u2).toContain('Estoque Problema · Divergente');
    expect(daSecao('Unidade 3 de 3')).toContain('Não veio no pacote (ausente)');
    // Foto lida, sem leitura do código.
    const semLeitura = dadosTeste();
    semLeitura.unidades[0] = { ...semLeitura.unidades[0], eanLido: null };
    expect(await textoDoPdf((await gerarPdfDossie(semLeitura, midiasTeste())).bytes)).toContain('Não lido');
  });

  it('o subtítulo de uma grade de fotos não fica sozinho no pé da página', async () => {
    const paginas = await paginasDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    const comSubtitulo = paginas.filter((p) => p.split('\n').includes('Fotos da avaria'));
    expect(comSubtitulo).toHaveLength(1);
    expect(comSubtitulo[0]).toContain('Foto da avaria 1');
  });

  it('pacote e unidades levam o carimbo de cada foto (data e hora da captura)', async () => {
    const paginas = await paginasDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste())).bytes);
    expect(paginas[1]).toContain('Foto 1');
    expect(paginas[1]).toContain('Etiqueta de rastreio e declaração de conteúdo');
    expect(paginas[1]).toContain('Foto 2');
    expect(paginas[1]).toContain('19/11/2026 10:02 · DEV-000123 · Operador Teste');
  });

  it('vídeo: um quadro, a data e a duração, e o aviso de que vai em arquivo separado', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const video = paginas[r.secoes.find((s) => s.titulo === 'Vídeo de Prova')!.pagina - 1];
    expect(video).toContain('Data da gravação');
    expect(video).toContain('19/11/2026 10:02');
    expect(video).toContain('Duração');
    expect(video).toContain('0:42');
    expect(video).toContain('O vídeo vai em arquivo separado.');
    expect(video).toMatch(/Mercado Livre não aceita vídeo/);
    expect(video).toMatch(/dentro do PDF/);
  });

  it('histórico: os rótulos da tela, quem e quando; sem as gerações do próprio dossiê', async () => {
    const r = await gerarPdfDossie(dadosTeste(), midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const historico = paginas[r.secoes.find((s) => s.titulo === 'Histórico')!.pagina - 1];
    for (const trecho of [
      'Devolução cadastrada',
      'Chegada registrada',
      'De Pendente de chegada para Aguardando conferência',
      'Evidência processada · Foto 3 · Unidade 1',
      'Conferência concluída',
      '19/11/2026 10:20 · Conferente Teste',
      '18/11/2026 09:00 · Sistema',
      'Motivo: Teste de motivo',
    ]) {
      expect(historico).toContain(trecho);
    }
    expect(historico).not.toContain('Dossiê de provas (PDF) gerado');
  });

  it('integridade: quando e por quem foi gerado, e o SHA-256 e o carimbo de cada foto e do vídeo', async () => {
    const dados = dadosTeste();
    dados.evidencias[1] = { ...dados.evidencias[1], sha256Final: null }; // Foto 2 sem o hash final: calcula agora
    const r = await gerarPdfDossie(dados, midiasTeste());
    const paginas = await paginasDoPdf(r.bytes);
    const integridade = paginas.slice(r.secoes.find((s) => s.titulo === 'Integridade dos arquivos')!.pagina - 1).join('\n');
    expect(integridade).toContain('Gerado em 19/11/2026 15:30 por Gestora Teste');
    for (const e of dados.evidencias) {
      expect(integridade).toContain(e.sha256Original);
      if (e.sha256Final) expect(integridade).toContain(e.sha256Final);
    }
    expect(integridade).toContain(`${'c'.repeat(64)} (calculado agora)`);
    expect(integridade).toContain('19/11/2026 10:02 · DEV-000123 · Operador Teste');
    expect(integridade).toContain('Foto da avaria 2 · Unidade 1');
    expect(integridade).toContain('Vídeo de Prova');
  });

  it('mídia faltando ou que não ficou pronta não quebra o PDF: aviso no lugar', async () => {
    const dados = dadosTeste();
    dados.evidencias = dados.evidencias
      .filter((e) => e.id !== 'f2' && e.tipo !== 'VIDEO_PROVA')
      .map((e) => (e.id === 'f3u1' ? { ...e, situacao: 'PROCESSANDO' as const, caminho: null, sha256Final: null } : e))
      .map((e) => (e.id === 'f4u1' ? { ...e, situacao: 'FALHOU' as const, caminho: null, sha256Final: null } : e));
    const midias = midiasTeste({ fotoFalha: ['f1'] });
    const texto = await textoDoPdf((await gerarPdfDossie(dados, midias)).bytes);
    expect(texto).toContain('Arquivo não encontrado no armazenamento.');
    expect(texto).toContain('Foto 2 não enviada.');
    expect(texto).toContain('Ainda em processamento');
    expect(texto).toContain('O processamento falhou');
    expect(texto).toContain('Esta devolução não tem Vídeo de Prova.');
    // Só pede ao armazenamento o que está pronto.
    expect(midias.chamadas.map((c) => c.id)).not.toContain('f3u1');
    expect(midias.chamadas.map((c) => c.id)).not.toContain('f4u1');

    const semQuadro = await textoDoPdf((await gerarPdfDossie(dadosTeste(), midiasTeste({ semQuadro: true }))).bytes);
    expect(semQuadro).toContain('Não foi possível tirar um quadro do vídeo.');
  });

  it('as imagens entram reduzidas (até 1280 px) e o PDF fica abaixo do limite numa tentativa só', async () => {
    const midias = midiasTeste();
    const r = await gerarPdfDossie(dadosTeste(), midias);
    expect(r.tentativas).toBe(1);
    expect(r.opcoes).toEqual({ ladoMaior: 1280, qualidade: 70 });
    const imagens = await imagensDoPdf(r.bytes);
    expect(imagens.length).toBe(9); // 8 fotos + o quadro do vídeo
    for (const i of imagens) expect(Math.max(i.largura, i.altura)).toBeLessThanOrEqual(1280);
    expect(new Set(midias.chamadas.map((c) => c.opcoes.ladoMaior))).toEqual(new Set([1280]));
  });

  it('acima do limite, refaz uma vez com 1024 px e qualidade 60', async () => {
    const midias = midiasTeste();
    const r = await gerarPdfDossie(dadosTeste(), midias, { limiteBytes: 1000 });
    expect(r.tentativas).toBe(2);
    expect(r.opcoes).toEqual({ ladoMaior: 1024, qualidade: 60 });
    expect(midias.chamadas.filter((c) => c.opcoes.ladoMaior === 1024 && c.opcoes.qualidade === 60)).toHaveLength(9);
    for (const i of await imagensDoPdf(r.bytes)) expect(Math.max(i.largura, i.altura)).toBeLessThanOrEqual(1024);
    expect(Buffer.from(r.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
  });

  it('caractere fora do WinAnsi (emoji) vira "?" em vez de erro', async () => {
    const dados = dadosTeste();
    dados.unidades[0] = { ...dados.unidades[0], observacao: 'Caixa amassada 📦' };
    await expect(gerarPdfDossie(dados, midiasTeste())).resolves.toMatchObject({ tentativas: 1 });
  });
});
