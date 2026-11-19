import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import { formatarDataHora } from '@/lib/formatar';
import { ROTULO_CANAL, ROTULO_DESTINO, ROTULO_MOTIVO, rotuloStatus } from '@/modules/devolucoes/dominio';
import { rotuloDaAcao } from '@/modules/historico/eventos';
import { paraWinAnsi } from '@/modules/lotes/pdf';
import { textoCarimbo } from '@/modules/midia/carimbo';
import {
  DESCRICAO_EVIDENCIA,
  ehTipoEvidencia,
  ROTULO_EVIDENCIA,
  ROTULO_SITUACAO_PROCESSAMENTO,
  type SituacaoProcessamento,
  type TipoEvidencia,
} from '@/modules/midia/dominio';
import {
  ACAO_DOSSIE_GERADO,
  formatarDuracao,
  IMAGEM_PADRAO,
  IMAGEM_REDUZIDA,
  LIMITE_BYTES_DOSSIE,
  leituraDoCodigo,
  ROTULO_LEITURA,
  type DadosDossie,
  type EvidenciaDossie,
  type OpcoesImagem,
  type UnidadeDossie,
} from './dominio';
import type { ImagemPdf } from './imagens';

/** Foto lida do armazenamento já reduzida, ou o motivo de não ter vindo (o PDF põe um aviso no lugar). */
export type ResultadoFoto = { ok: true; imagem: ImagemPdf; sha256Calculado: string | null } | { ok: false; motivo: string };
export type ResultadoQuadro = { imagem: ImagemPdf | null; duracaoSegundos: number | null; sha256Calculado: string | null; problema: string | null };

/** De onde vêm as imagens (o armazenamento, em produção). Chamado uma imagem por vez, só para as evidências PRONTA. */
export type MidiasDossie = {
  foto(e: EvidenciaDossie, opcoes: OpcoesImagem): Promise<ResultadoFoto>;
  quadroDoVideo(e: EvidenciaDossie, opcoes: OpcoesImagem): Promise<ResultadoQuadro>;
};

export type SecaoPdf = { titulo: string; pagina: number };
export type ResultadoPdf = { bytes: Uint8Array; tamanho: number; paginas: number; secoes: SecaoPdf[]; opcoes: OpcoesImagem; tentativas: number };

const SISTEMA = 'Gestão de Devoluções';
const A4: [number, number] = [595.28, 841.89];
const MARGEM = 40;
const LARGURA = A4[0] - 2 * MARGEM;
const TOPO = A4[1] - MARGEM;
/** O conteúdo para aqui; abaixo fica o rodapé. */
const BASE = 58;
const LARGURA_ROTULO = 160;
const PRETO = rgb(0.1, 0.1, 0.1);
const CINZA = rgb(0.33, 0.33, 0.33);
const LINHA = rgb(0.8, 0.8, 0.8);
const FUNDO_AVISO = rgb(0.95, 0.95, 0.95);
const VERDE = rgb(0.07, 0.35, 0.25);

type Fontes = { normal: PDFFont; negrito: PDFFont; mono: PDFFont };

/** Quebra em linhas que cabem na largura; "\n" separa parágrafos. Palavra maior que a linha é cortada. */
function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const cabe = (t: string) => fonte.widthOfTextAtSize(t, tamanho) <= largura;
  const linhas: string[] = [];
  for (const paragrafo of paraWinAnsi(texto).split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (cabe(tentativa)) {
        atual = tentativa;
        continue;
      }
      if (atual) linhas.push(atual);
      let resto = palavra;
      while (!cabe(resto)) {
        let corte = resto.length - 1;
        while (corte > 1 && !cabe(resto.slice(0, corte))) corte -= 1;
        linhas.push(resto.slice(0, corte));
        resto = resto.slice(corte);
      }
      atual = resto;
    }
    linhas.push(atual);
  }
  return linhas;
}

/** Uma linha só: corta com "..." o que não cabe. */
function cortar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  const limpo = paraWinAnsi(texto).replace(/\s+/g, ' ');
  if (fonte.widthOfTextAtSize(limpo, tamanho) <= largura) return limpo;
  let fim = limpo.length;
  while (fim > 1 && fonte.widthOfTextAtSize(`${limpo.slice(0, fim)}...`, tamanho) > largura) fim -= 1;
  return `${limpo.slice(0, fim)}...`;
}

function avisoDaSituacao(situacao: SituacaoProcessamento): string {
  switch (situacao) {
    case 'RECEBIDA':
    case 'PROCESSANDO':
      return 'Ainda em processamento: o arquivo não ficou pronto a tempo deste PDF.';
    case 'FALHOU':
      return 'O processamento falhou: o arquivo não está disponível.';
    case 'APAGADA':
      return 'Arquivo apagado pelo prazo de guarda.';
    case 'PRONTA':
      return 'Arquivo não disponível.';
  }
}

function nomeDoTipo(tipo: TipoEvidencia): string {
  return tipo === 'EXTRA' ? 'Foto da avaria' : ROTULO_EVIDENCIA[tipo];
}

type Celula = { legenda: string; descricao: string | null; evidencia: EvidenciaDossie | null };

/** Legenda (2 linhas) + caixa da foto + carimbo. */
const alturaDaLinha = (alturaCaixa: number) => 30 + alturaCaixa + 16;
const CAIXA_UNIDADE = 230;
const CAIXA_AVARIA = 200;

/** Escreve de cima para baixo, abrindo páginas novas quando o espaço acaba. */
class Escritor {
  readonly paginas: PDFPage[] = [];
  pagina!: PDFPage;
  y = TOPO;

  constructor(
    readonly doc: PDFDocument,
    readonly f: Fontes,
  ) {}

  novaPagina(): void {
    this.pagina = this.doc.addPage(A4);
    this.paginas.push(this.pagina);
    this.y = TOPO;
  }

  caber(altura: number): void {
    if (this.y - altura < BASE) this.novaPagina();
  }

  desenhar(texto: string, x: number, y: number, tamanho: number, fonte: PDFFont, cor: RGB = PRETO, pagina: PDFPage = this.pagina): void {
    pagina.drawText(paraWinAnsi(texto), { x, y, size: tamanho, font: fonte, color: cor });
  }

  escrever(texto: string, o: { tamanho?: number; fonte?: PDFFont; cor?: RGB; recuo?: number } = {}): void {
    const tamanho = o.tamanho ?? 10;
    const fonte = o.fonte ?? this.f.normal;
    const x = MARGEM + (o.recuo ?? 0);
    const entrelinha = tamanho * 1.4;
    for (const linha of quebrar(texto, fonte, tamanho, LARGURA - (o.recuo ?? 0))) {
      this.caber(entrelinha);
      this.desenhar(linha, x, this.y - tamanho, tamanho, fonte, o.cor);
      this.y -= entrelinha;
    }
  }

  titulo(texto: string): void {
    this.caber(44);
    this.desenhar(texto, MARGEM, this.y - 18, 18, this.f.negrito, VERDE);
    this.y -= 26;
    this.pagina.drawLine({ start: { x: MARGEM, y: this.y }, end: { x: MARGEM + LARGURA, y: this.y }, thickness: 1, color: LINHA });
    this.y -= 14;
  }

  /** `manterCom`: altura do que vem logo abaixo (a 1ª linha de fotos), para o subtítulo não ficar sozinho no pé da página. */
  subtitulo(texto: string, manterCom = 40): void {
    this.caber(28 + manterCom);
    this.y -= 6;
    this.desenhar(texto, MARGEM, this.y - 12, 12, this.f.negrito);
    this.y -= 22;
  }

  /** Rótulo à esquerda e valor à direita, linha a linha (um valor longo continua na página seguinte). */
  campo(rotulo: string, valor: string): void {
    const rotulos = quebrar(rotulo, this.f.negrito, 9, LARGURA_ROTULO - 10);
    const valores = quebrar(valor.trim() === '' ? '—' : valor, this.f.normal, 10, LARGURA - LARGURA_ROTULO);
    const n = Math.max(rotulos.length, valores.length);
    const entrelinha = 14;
    this.caber(Math.min(n, 3) * entrelinha);
    for (let i = 0; i < n; i++) {
      this.caber(entrelinha);
      if (rotulos[i]) this.desenhar(rotulos[i], MARGEM, this.y - 10, 9, this.f.negrito, CINZA);
      if (valores[i]) this.desenhar(valores[i], MARGEM + LARGURA_ROTULO, this.y - 10, 10, this.f.normal);
      this.y -= entrelinha;
    }
    this.y -= 3;
  }

  /** Caixa cinza com o texto dentro: avisos e destaques. */
  quadro(texto: string, o: { negrito?: boolean } = {}): void {
    const fonte = o.negrito ? this.f.negrito : this.f.normal;
    const linhas = quebrar(texto, fonte, 10.5, LARGURA - 24);
    const altura = linhas.length * 15 + 16;
    this.caber(altura + 6);
    this.pagina.drawRectangle({ x: MARGEM, y: this.y - altura, width: LARGURA, height: altura, color: FUNDO_AVISO, borderColor: LINHA, borderWidth: 0.75 });
    linhas.forEach((l, i) => this.desenhar(l, MARGEM + 12, this.y - 8 - 10.5 - i * 15, 10.5, fonte));
    this.y -= altura + 10;
  }

  /** A imagem cabendo na caixa (sem distorcer), ou o aviso no lugar. A imagem entra no PDF já reduzida. */
  async caixa(x: number, topo: number, largura: number, altura: number, conteudo: { imagem: ImagemPdf } | { aviso: string }): Promise<void> {
    const temImagem = 'imagem' in conteudo;
    this.pagina.drawRectangle({
      x,
      y: topo - altura,
      width: largura,
      height: altura,
      borderColor: LINHA,
      borderWidth: 0.75,
      ...(temImagem ? {} : { color: FUNDO_AVISO }),
    });
    if (temImagem) {
      const imagem = await this.doc.embedJpg(conteudo.imagem.jpeg);
      const escala = Math.min((largura - 4) / imagem.width, (altura - 4) / imagem.height);
      const w = imagem.width * escala;
      const h = imagem.height * escala;
      this.pagina.drawImage(imagem, { x: x + (largura - w) / 2, y: topo - altura + (altura - h) / 2, width: w, height: h });
      return;
    }
    const linhas = quebrar(conteudo.aviso, this.f.normal, 9.5, largura - 24);
    const inicio = topo - altura / 2 + (linhas.length * 13) / 2 - 9.5;
    linhas.forEach((l, i) => {
      const w = this.f.normal.widthOfTextAtSize(l, 9.5);
      this.desenhar(l, x + (largura - w) / 2, inicio - i * 13, 9.5, this.f.normal, CINZA);
    });
  }
}

/** Monta o PDF uma vez, com as imagens no tamanho dado. */
async function montar(d: DadosDossie, midias: MidiasDossie, opcoes: OpcoesImagem): Promise<Omit<ResultadoPdf, 'opcoes' | 'tentativas' | 'tamanho'>> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Dossiê de provas ${d.codigo}`);
  doc.setSubject('Provas da devolução: fotos, quadro do vídeo, histórico e integridade dos arquivos');
  doc.setAuthor(d.empresa ?? SISTEMA);
  doc.setCreator(SISTEMA);
  doc.setProducer(SISTEMA);
  doc.setLanguage('pt-BR');
  doc.setCreationDate(d.geradoEm);
  doc.setModificationDate(d.geradoEm);
  const f: Fontes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrito: await doc.embedFont(StandardFonts.HelveticaBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const e = new Escritor(doc, f);
  const secoes: SecaoPdf[] = [];
  const abrirSecao = (titulo: string) => {
    e.novaPagina();
    secoes.push({ titulo, pagina: e.paginas.length });
    e.titulo(titulo);
  };
  /** SHA-256 calculado agora, para o que não tinha o hash final guardado. */
  const calculados = new Map<string, string>();
  const unidadeDe = new Map(d.unidades.map((u) => [u.id, u]));
  const ehML = d.canal === 'MERCADO_LIVRE';
  const geradoEm = formatarDataHora(d.geradoEm);
  const video = d.evidencias.find((x) => x.tipo === 'VIDEO_PROVA') ?? null;
  const pronta = (x: EvidenciaDossie) => x.situacao === 'PRONTA' && x.caminho !== null;

  const doTipo = (tipo: TipoEvidencia, itemId: string | null) => d.evidencias.find((x) => x.tipo === tipo && x.itemId === itemId) ?? null;
  const avariasDe = (itemId: string) => d.evidencias.filter((x) => x.tipo === 'EXTRA' && x.itemId === itemId);

  function nomeDaEvidencia(x: EvidenciaDossie): string {
    const u = x.itemId ? unidadeDe.get(x.itemId) : undefined;
    if (x.tipo === 'EXTRA') {
      if (!u) return 'Foto extra';
      return `Foto da avaria ${avariasDe(u.id).indexOf(x) + 1} · Unidade ${u.unidade}`;
    }
    if (x.tipo === 'FOTO_1_ETIQUETA' || x.tipo === 'FOTO_2_EMBALAGEM') return `${ROTULO_EVIDENCIA[x.tipo]} · Pacote`;
    return u ? `${ROTULO_EVIDENCIA[x.tipo]} · Unidade ${u.unidade}` : ROTULO_EVIDENCIA[x.tipo];
  }

  function carimboDe(x: EvidenciaDossie): string {
    return textoCarimbo({ quando: x.enviadoEm, codigo: d.codigo, usuario: x.enviadoPorNome ?? 'usuário removido' });
  }

  async function conteudoDaCelula(c: Celula): Promise<{ imagem: ImagemPdf } | { aviso: string }> {
    if (!c.evidencia) return { aviso: `${c.legenda} não enviada.` };
    if (!pronta(c.evidencia)) return { aviso: avisoDaSituacao(c.evidencia.situacao) };
    const r = await midias.foto(c.evidencia, opcoes);
    if (!r.ok) return { aviso: r.motivo };
    if (r.sha256Calculado) calculados.set(c.evidencia.id, r.sha256Calculado);
    return { imagem: r.imagem };
  }

  /** Fotos em grade (1 ou 2 colunas). Uma foto por vez: lê, reduz e embute antes de pedir a próxima. */
  async function grade(celulas: Celula[], colunas: 1 | 2, alturaCaixa: number): Promise<void> {
    const vao = 12;
    const largura = (LARGURA - vao * (colunas - 1)) / colunas;
    const alturaLinha = alturaDaLinha(alturaCaixa);
    for (let i = 0; i < celulas.length; i += colunas) {
      e.caber(alturaLinha);
      const topo = e.y;
      for (let j = 0; j < colunas && i + j < celulas.length; j++) {
        const c = celulas[i + j];
        const x = MARGEM + j * (largura + vao);
        e.desenhar(cortar(c.legenda, f.negrito, 10.5, largura), x, topo - 10.5, 10.5, f.negrito);
        if (c.descricao) e.desenhar(cortar(c.descricao, f.normal, 8.5, largura), x, topo - 23, 8.5, f.normal, CINZA);
        await e.caixa(x, topo - 28, largura, alturaCaixa, await conteudoDaCelula(c));
        if (c.evidencia) {
          const legenda = pronta(c.evidencia)
            ? `Carimbo: ${carimboDe(c.evidencia)}`
            : `Enviada em ${formatarDataHora(c.evidencia.enviadoEm)} · ${ROTULO_SITUACAO_PROCESSAMENTO[c.evidencia.situacao]}`;
          e.desenhar(cortar(legenda, f.normal, 8, largura), x, topo - 28 - alturaCaixa - 11, 8, f.normal, CINZA);
        }
      }
      e.y -= alturaLinha + 8;
    }
  }

  // 1. Capa
  e.novaPagina();
  secoes.push({ titulo: 'Dossiê de provas', pagina: 1 });
  e.desenhar('Dossiê de provas', MARGEM, e.y - 26, 26, f.negrito, VERDE);
  e.y -= 38;
  e.desenhar(d.codigo, MARGEM, e.y - 20, 20, f.negrito);
  e.y -= 34;
  if (d.empresa) e.escrever(`Empresa: ${d.empresa}`, { tamanho: 11, fonte: f.negrito });
  e.escrever(`Gerado pelo sistema ${SISTEMA} em ${geradoEm} por ${d.geradoPorNome}.`, { tamanho: 10, cor: CINZA });
  e.y -= 4;
  e.escrever(
    'Provas da conferência desta devolução: fotos do pacote e de cada unidade, um quadro do Vídeo de Prova, o histórico e o código de integridade (SHA-256) de cada arquivo.',
    { tamanho: 10 },
  );
  e.subtitulo('Dados da devolução');
  e.campo('Código da devolução', d.codigo);
  e.campo('Canal', d.canal ? ROTULO_CANAL[d.canal] : 'A identificar');
  e.campo(ehML ? 'Venda (pedido) no ML' : 'Número do pedido', d.pedidos.join(', '));
  if (ehML) {
    e.campo('Reclamação no ML', d.reclamacaoId ?? '—');
    if (d.devolucaoExternaId) e.campo('Devolução no ML', d.devolucaoExternaId);
    if (d.contaML) e.campo('Conta do ML', d.contaML);
  }
  e.campo('Código de rastreamento', d.rastreio ?? '—');
  e.campo('Transportadora', d.transportadora ?? '—');
  e.campo('Motivo do cliente', d.motivoCliente ?? '—');
  if (ehML) {
    const m = d.motivoReclamacaoML;
    e.campo('Motivo da reclamação no ML', m ? (m.texto ? `${m.texto} (${m.id})` : m.id) : '—');
  }
  e.campo('Chegada', d.recebidaEm ? formatarDataHora(d.recebidaEm) : 'Sem registro de chegada');
  e.campo('Recebida por', d.recebidaPorNome ?? '—');
  e.campo('Início da conferência', d.conferenciaIniciadaEm ? formatarDataHora(d.conferenciaIniciadaEm) : '—');
  e.campo('Fim da conferência', d.conferidaEm ? formatarDataHora(d.conferidaEm) : '—');
  e.campo('Conferente', d.conferenteNome ?? '—');
  const ausentes = d.unidades.filter((u) => u.motivo === 'AUSENTE').length;
  e.campo('Unidades', `${d.unidades.length}${ausentes > 0 ? ` (${ausentes} não veio no pacote)` : ''}`);
  e.subtitulo('Conteúdo');
  const indice: { pagina: PDFPage; y: number; rotulo: string; secoes: string[] }[] = [];
  const reservar = (rotulo: string, nomes: string[]) => {
    e.caber(15);
    indice.push({ pagina: e.pagina, y: e.y - 10, rotulo, secoes: nomes });
    e.y -= 15;
  };
  reservar('Pacote (Fotos 1 e 2)', ['Pacote']);
  const titulosUnidades = d.unidades.map((u) => `Unidade ${u.unidade} de ${d.unidades.length}`);
  if (d.unidades.length > 0) reservar(d.unidades.length === 1 ? 'Unidade 1' : `Unidades 1 a ${d.unidades.length}`, titulosUnidades);
  reservar('Vídeo de Prova', ['Vídeo de Prova']);
  reservar('Histórico', ['Histórico']);
  reservar('Integridade dos arquivos (SHA-256)', ['Integridade dos arquivos']);
  e.y -= 8;
  e.quadro('O Vídeo de Prova vai em arquivo separado: o Mercado Livre não aceita vídeo dentro do PDF.');

  // 2. Pacote
  abrirSecao('Pacote');
  await grade(
    (['FOTO_1_ETIQUETA', 'FOTO_2_EMBALAGEM'] as const).map((tipo) => ({
      legenda: ROTULO_EVIDENCIA[tipo],
      descricao: DESCRICAO_EVIDENCIA[tipo],
      evidencia: doTipo(tipo, null),
    })),
    1,
    270,
  );

  // 3. Unidades
  for (const [i, u] of d.unidades.entries()) {
    abrirSecao(titulosUnidades[i]);
    await secaoDaUnidade(u);
  }

  async function secaoDaUnidade(u: UnidadeDossie): Promise<void> {
    const ausente = u.motivo === 'AUSENTE' || u.status === 'AUSENTE';
    if (ausente) e.quadro('Não veio no pacote (ausente)', { negrito: true });
    e.campo('Produto esperado', `${u.sku} · ${u.descricao ?? 'SKU fora do cadastro de produtos'}`);
    e.campo('EAN esperado', u.eanEsperado ?? '—');
    if (!ausente) {
      const leitura = leituraDoCodigo(u);
      e.campo('Código de barras lido', u.eanLido ? `${u.eanLido} · ${ROTULO_LEITURA[leitura]}` : `${ROTULO_LEITURA[leitura]} (produto confirmado sem leitura)`);
      if (u.divergente && u.produtoRecebido) e.campo('Produto recebido', `${u.produtoRecebido.sku} · ${u.produtoRecebido.descricao}`);
      e.campo('Número de série (S/N)', u.serial ?? '—');
      e.campo('Lote', u.loteFabricacao ?? '—');
      e.campo('Validade', u.validade ?? '—');
    }
    e.campo(
      'Destino',
      u.destino ? `${ROTULO_DESTINO[u.destino]}${u.motivo && u.motivo !== 'AUSENTE' ? ` · ${ROTULO_MOTIVO[u.motivo]}` : ''}` : ausente ? 'Não veio no pacote (ausente)' : '—',
    );
    e.campo('Observação', u.observacao ?? '—');
    const f3 = doTipo('FOTO_3_PRODUTO', u.id);
    const f4 = doTipo('FOTO_4_CODIGO_SERIAL', u.id);
    if (!ausente || f3 || f4) {
      e.subtitulo('Fotos da unidade', alturaDaLinha(CAIXA_UNIDADE));
      await grade(
        (['FOTO_3_PRODUTO', 'FOTO_4_CODIGO_SERIAL'] as const).map((tipo) => ({
          legenda: ROTULO_EVIDENCIA[tipo],
          descricao: DESCRICAO_EVIDENCIA[tipo],
          evidencia: tipo === 'FOTO_3_PRODUTO' ? f3 : f4,
        })),
        2,
        CAIXA_UNIDADE,
      );
    }
    const avarias = avariasDe(u.id);
    if (avarias.length > 0) {
      e.subtitulo('Fotos da avaria', alturaDaLinha(CAIXA_AVARIA));
      await grade(
        avarias.map((x, k) => ({ legenda: `Foto da avaria ${k + 1}`, descricao: null, evidencia: x })),
        2,
        CAIXA_AVARIA,
      );
    }
  }

  // 4. Vídeo de Prova
  abrirSecao('Vídeo de Prova');
  if (!video) {
    e.quadro('Esta devolução não tem Vídeo de Prova.');
  } else {
    let conteudo: { imagem: ImagemPdf } | { aviso: string } = { aviso: avisoDaSituacao(video.situacao) };
    let duracao: number | null = null;
    if (pronta(video)) {
      const q = await midias.quadroDoVideo(video, opcoes);
      duracao = q.duracaoSegundos;
      if (q.sha256Calculado) calculados.set(video.id, q.sha256Calculado);
      conteudo = q.imagem ? { imagem: q.imagem } : { aviso: q.problema ?? 'Quadro do vídeo indisponível.' };
    }
    e.escrever('Um quadro do vídeo:', { tamanho: 9, cor: CINZA });
    e.caber(300);
    await e.caixa(MARGEM, e.y, LARGURA, 290, conteudo);
    e.y -= 302;
    e.campo('Data da gravação', `${formatarDataHora(video.enviadoEm)} (hora em que o servidor recebeu)`);
    e.campo('Duração', duracao !== null ? formatarDuracao(duracao) : '—');
    e.campo('Enviado por', video.enviadoPorNome ?? '—');
    e.campo('Situação', ROTULO_SITUACAO_PROCESSAMENTO[video.situacao]);
  }
  e.y -= 4;
  e.quadro('O vídeo vai em arquivo separado.\nO Mercado Livre não aceita vídeo dentro do PDF: anexe o arquivo do vídeo na resposta, junto com este dossiê.', {
    negrito: true,
  });

  // 5. Histórico
  abrirSecao('Histórico');
  const eventos = d.eventos.filter((ev) => ev.acao !== ACAO_DOSSIE_GERADO);
  if (eventos.length === 0) e.escrever('Nenhum evento registrado.');
  for (const ev of eventos) {
    const tipo = typeof ev.dados?.tipo === 'string' && ehTipoEvidencia(ev.dados.tipo) ? ev.dados.tipo : null;
    const item = typeof ev.dados?.itemId === 'string' ? unidadeDe.get(ev.dados.itemId) : undefined;
    const detalhe = tipo ? ` · ${nomeDoTipo(tipo)}${item ? ` · Unidade ${item.unidade}` : ''}` : '';
    const linhas: { texto: string; tamanho: number; fonte: PDFFont; cor: RGB }[] = [
      { texto: `${rotuloDaAcao(ev.acao)}${detalhe}`, tamanho: 10, fonte: f.negrito, cor: PRETO },
    ];
    if (ev.para && ev.de !== ev.para) {
      linhas.push({ texto: ev.de ? `De ${rotuloStatus(ev.de)} para ${rotuloStatus(ev.para)}` : `Status: ${rotuloStatus(ev.para)}`, tamanho: 9.5, fonte: f.normal, cor: PRETO });
    }
    const motivo = ev.dados?.motivo;
    if (typeof motivo === 'string') linhas.push({ texto: `Motivo: ${motivo}`, tamanho: 9.5, fonte: f.normal, cor: PRETO });
    linhas.push({ texto: `${formatarDataHora(ev.em)} · ${ev.usuarioNome ?? 'Sistema'}`, tamanho: 8.5, fonte: f.normal, cor: CINZA });
    e.caber(linhas.length * 14 + 8);
    for (const l of linhas) e.escrever(l.texto, { tamanho: l.tamanho, fonte: l.fonte, cor: l.cor });
    e.y -= 8;
  }

  // 6. Integridade dos arquivos
  abrirSecao('Integridade dos arquivos');
  e.escrever(`Gerado em ${geradoEm} por ${d.geradoPorNome}, pelo sistema ${SISTEMA}.`, { tamanho: 10.5, fonte: f.negrito });
  e.y -= 2;
  e.escrever(
    'O SHA-256 é a impressão digital de cada arquivo guardado no sistema: qualquer mudança no arquivo muda o código. As imagens deste PDF são cópias reduzidas; os códigos abaixo são dos arquivos guardados. Cada foto tem gravado o carimbo com a data e a hora em que o servidor a recebeu, o código da devolução e o usuário.',
    { tamanho: 9.5, cor: CINZA },
  );
  e.y -= 6;
  for (const x of ordenarEvidencias(d)) {
    const final = x.sha256Final ?? calculados.get(x.id);
    const linhas: { texto: string; tamanho: number; fonte: PDFFont; cor: RGB; recuo?: number }[] = [
      { texto: `${nomeDaEvidencia(x)} · ${ROTULO_SITUACAO_PROCESSAMENTO[x.situacao]}`, tamanho: 10, fonte: f.negrito, cor: PRETO },
      x.tipo === 'VIDEO_PROVA' || !pronta(x)
        ? { texto: `Recebido em ${formatarDataHora(x.enviadoEm)} por ${x.enviadoPorNome ?? 'usuário removido'}`, tamanho: 9, fonte: f.normal, cor: PRETO }
        : { texto: `Carimbo (data e hora da captura): ${carimboDe(x)}`, tamanho: 9, fonte: f.normal, cor: PRETO },
      { texto: 'SHA-256 do arquivo guardado:', tamanho: 8.5, fonte: f.normal, cor: CINZA },
      {
        texto: final ? `${final}${x.sha256Final ? '' : ' (calculado agora)'}` : '— (o arquivo final ainda não existe)',
        tamanho: 8,
        fonte: final ? f.mono : f.normal,
        cor: PRETO,
        recuo: 8,
      },
      { texto: 'SHA-256 do original recebido:', tamanho: 8.5, fonte: f.normal, cor: CINZA },
      { texto: x.sha256Original, tamanho: 8, fonte: f.mono, cor: PRETO, recuo: 8 },
    ];
    e.caber(linhas.length * 13 + 10);
    for (const l of linhas) e.escrever(l.texto, { tamanho: l.tamanho, fonte: l.fonte, cor: l.cor, recuo: l.recuo });
    e.y -= 10;
  }
  if (d.evidencias.length === 0) e.escrever('Esta devolução não tem fotos nem vídeo.');

  // Índice da capa (agora que as páginas existem) e rodapé em todas.
  for (const item of indice) {
    const paginas = item.secoes.map((s) => secoes.find((x) => x.titulo === s)?.pagina).filter((p): p is number => p !== undefined);
    if (paginas.length === 0) continue;
    const ate = Math.max(...paginas);
    const de = Math.min(...paginas);
    const ref = de === ate ? `página ${de}` : `páginas ${de} a ${ate}`;
    e.desenhar(item.rotulo, MARGEM + 8, item.y, 10.5, f.normal, PRETO, item.pagina);
    e.desenhar(ref, MARGEM + LARGURA - f.normal.widthOfTextAtSize(paraWinAnsi(ref), 10.5), item.y, 10.5, f.normal, PRETO, item.pagina);
  }
  const total = e.paginas.length;
  const rodape = `${d.codigo} · Dossiê de provas · gerado em ${geradoEm} por ${d.geradoPorNome}`;
  e.paginas.forEach((p, i) => {
    const numero = `Página ${i + 1} de ${total}`;
    const larguraNumero = f.normal.widthOfTextAtSize(numero, 7.5);
    p.drawLine({ start: { x: MARGEM, y: 40 }, end: { x: MARGEM + LARGURA, y: 40 }, thickness: 0.5, color: LINHA });
    e.desenhar(cortar(rodape, f.normal, 7.5, LARGURA - larguraNumero - 16), MARGEM, 28, 7.5, f.normal, CINZA, p);
    e.desenhar(numero, MARGEM + LARGURA - larguraNumero, 28, 7.5, f.normal, CINZA, p);
  });

  const bytes = await doc.save();
  return { bytes, paginas: total, secoes };
}

/** Pacote, depois cada unidade (Fotos 3 e 4 e as da avaria), depois o vídeo e o resto. */
function ordenarEvidencias(d: DadosDossie): EvidenciaDossie[] {
  const ordem: EvidenciaDossie[] = [];
  const pegar = (filtro: (x: EvidenciaDossie) => boolean) => {
    for (const x of d.evidencias) if (filtro(x) && !ordem.includes(x)) ordem.push(x);
  };
  pegar((x) => x.tipo === 'FOTO_1_ETIQUETA');
  pegar((x) => x.tipo === 'FOTO_2_EMBALAGEM');
  for (const u of d.unidades) {
    pegar((x) => x.itemId === u.id && x.tipo === 'FOTO_3_PRODUTO');
    pegar((x) => x.itemId === u.id && x.tipo === 'FOTO_4_CODIGO_SERIAL');
    pegar((x) => x.itemId === u.id && x.tipo === 'EXTRA');
  }
  pegar((x) => x.tipo === 'VIDEO_PROVA');
  pegar(() => true);
  return ordem;
}

/**
 * O dossiê em PDF (extra). Imagens a 1280 px e qualidade 70; se o PDF passar de 8 MB, refaz uma vez a 1024 px e 60
 * (o ML recusa anexos grandes). Mídia que falta ou não ficou pronta vira um aviso, nunca um erro.
 */
export async function gerarPdfDossie(d: DadosDossie, midias: MidiasDossie, config: { limiteBytes?: number } = {}): Promise<ResultadoPdf> {
  const limite = config.limiteBytes ?? LIMITE_BYTES_DOSSIE;
  const primeira = await montar(d, midias, IMAGEM_PADRAO);
  if (primeira.bytes.length <= limite) return { ...primeira, tamanho: primeira.bytes.length, opcoes: IMAGEM_PADRAO, tentativas: 1 };
  const segunda = await montar(d, midias, IMAGEM_REDUZIDA);
  return { ...segunda, tamanho: segunda.bytes.length, opcoes: IMAGEM_REDUZIDA, tentativas: 2 };
}
