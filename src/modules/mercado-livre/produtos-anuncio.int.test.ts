import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ProdutoDoAnuncioML } from '@/conectores/marketplace/mercadolivre/tipos';
import { devolucoes, eventosHistorico, itensDevolucao, produtos } from '@/db/schema';
import { obterConferencia } from '@/modules/conferencia/leitura';
import { listarEventos } from '@/modules/historico/eventos';
import { criarDbTeste, limparTabelas } from '../../../tests/helpers/db';
import { criarDevolucaoTeste, criarFornecedorTeste, criarProdutoTeste, criarUsuarioTeste } from '../../../tests/helpers/fabricas';
import { dadosDevolucaoMLTeste, devolucaoExternaTeste } from '../../../tests/helpers/fabricas-ml';
import { aplicarReclamacao, type ResultadoAplicacao } from './sincronizar';

/** Produtos do ML (extra, emenda E22): a sincronização cadastra o SKU que falta e completa só os campos vazios. */
const { db, sql } = criarDbTeste();
const AGORA = new Date('2026-11-19T15:00:00Z');
const FOTO = 'https://http2.mlstatic.com/D_611111-MLB70000000001_072026-O.jpg';
const OUTRA_FOTO = 'https://http2.mlstatic.com/D_622222-MLB70000000002_072026-O.jpg';
const EAN = '7891234567895';

beforeEach(async () => {
  await limparTabelas(sql);
});
afterAll(async () => {
  await sql.end();
});

function anuncio(m: Partial<ProdutoDoAnuncioML> = {}): ProdutoDoAnuncioML {
  return { sku: 'fone-01', mlItemId: 'MLB3456789012', descricao: 'Fone de Ouvido Bluetooth', ean: EAN, fotoUrl: FOTO, ...m };
}

/** Devolução do ML com um item por SKU (quantidade 1) e os produtos dos anúncios. */
function reclamacaoCom(skus: string[], produtosDosAnuncios: ProdutoDoAnuncioML[], m: Parameters<typeof devolucaoExternaTeste>[0] = {}) {
  const d = devolucaoExternaTeste({ itens: skus.map((sku) => ({ pedido: 'P1', sku, ean: null, quantidade: 1 })), ...m });
  return { d, dados: dadosDevolucaoMLTeste(d, { produtos: produtosDosAnuncios }) };
}

function idDa(r: ResultadoAplicacao): string {
  if (!('devolucaoId' in r)) throw new Error(`esperava uma devolução, veio ${r.acao}`);
  return r.devolucaoId;
}

async function produtoDoSku(sku: string) {
  const [p] = await db.select().from(produtos).where(eq(produtos.sku, sku));
  return p;
}

async function ligacoes(devolucaoId: string) {
  return (await db.select().from(itensDevolucao).where(eq(itensDevolucao.devolucaoId, devolucaoId)).orderBy(asc(itensDevolucao.unidade))).map(
    (i) => [i.sku, i.produtoEsperadoId],
  );
}

describe('produtos do ML na sincronização (extra)', () => {
  it('SKU fora do cadastro: cadastra o produto pelo anúncio, liga os itens e grava o evento do produto', async () => {
    const { dados } = reclamacaoCom(['fone-01'], [anuncio()]);
    const devolucaoId = idDa(await aplicarReclamacao(db, dados, AGORA));
    const p = await produtoDoSku('FONE-01');
    expect(p).toMatchObject({
      descricao: 'Fone de Ouvido Bluetooth',
      ean: EAN,
      fotoUrl: FOTO,
      mlItemId: 'MLB3456789012',
      fornecedorId: null,
      ncm: null,
      custo: null,
      unidade: null,
    });
    expect(await ligacoes(devolucaoId)).toEqual([['FONE-01', p.id]]);
    const eventos = await listarEventos(db, 'produto', p.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ acao: 'ml_produto_criado', usuarioNome: null });
    expect(eventos[0].dados).toMatchObject({ sku: 'FONE-01', mlItemId: 'MLB3456789012', reclamacaoId: dados.reclamacaoId });
  });

  it('produto que já existe: preenche só foto, EAN e anúncio vazios; nunca mexe em descrição, fornecedor, NCM, custo e unidade', async () => {
    const fornecedor = await criarFornecedorTeste(db, { cnpj: '11222333000181' });
    const id = await criarProdutoTeste(db, { sku: 'FONE-01', ean: null, descricao: 'Fone do cadastro', cnpjFornecedor: '11222333000181', ncm: '85183000', custo: '45.90', unidade: 'UN' });
    const { dados } = reclamacaoCom(['fone-01'], [anuncio({ descricao: 'Título do anúncio' })]);
    const devolucaoId = idDa(await aplicarReclamacao(db, dados, AGORA));
    expect(await produtoDoSku('FONE-01')).toMatchObject({
      id,
      descricao: 'Fone do cadastro',
      fornecedorId: fornecedor,
      ncm: '85183000',
      custo: '45.90',
      unidade: 'UN',
      ean: EAN,
      fotoUrl: FOTO,
      mlItemId: 'MLB3456789012',
    });
    expect(await ligacoes(devolucaoId)).toEqual([['FONE-01', id]]);
    const eventos = await listarEventos(db, 'produto', id);
    expect(eventos.map((e) => e.acao)).toEqual(['ml_produto_completado']);
    expect(eventos[0].dados).toMatchObject({ campos: ['foto_url', 'ml_item_id', 'ean'] });
  });

  it('produto com foto, EAN e anúncio já preenchidos: nada muda e nenhum evento', async () => {
    const id = await criarProdutoTeste(db, { sku: 'FONE-01', ean: '7891234567888', descricao: 'Fone do cadastro' });
    await db.update(produtos).set({ fotoUrl: OUTRA_FOTO, mlItemId: 'MLB1' }).where(eq(produtos.id, id));
    await aplicarReclamacao(db, reclamacaoCom(['fone-01'], [anuncio()]).dados, AGORA);
    expect(await produtoDoSku('FONE-01')).toMatchObject({ ean: '7891234567888', fotoUrl: OUTRA_FOTO, mlItemId: 'MLB1', descricao: 'Fone do cadastro' });
    expect(await listarEventos(db, 'produto', id)).toEqual([]);
  });

  it('EAN que já é de outro produto não é copiado (nem no cadastro novo, nem no que existe sem EAN)', async () => {
    await criarProdutoTeste(db, { sku: 'OUTRO-SKU', ean: EAN });
    await aplicarReclamacao(db, reclamacaoCom(['zero-03'], [anuncio({ sku: 'zero-03', mlItemId: 'MLB3', ean: `0${EAN}` })]).dados, AGORA);
    expect(await produtoDoSku('ZERO-03')).toMatchObject({ ean: null });
    const semEan = await criarProdutoTeste(db, { sku: 'CABO-02', ean: null });
    await aplicarReclamacao(db, reclamacaoCom(['fone-01', 'cabo-02'], [anuncio(), anuncio({ sku: 'cabo-02', mlItemId: 'MLB2' })]).dados, AGORA);
    expect(await produtoDoSku('FONE-01')).toMatchObject({ ean: null, fotoUrl: FOTO });
    expect(await produtoDoSku('CABO-02')).toMatchObject({ id: semEan, ean: null, fotoUrl: FOTO, mlItemId: 'MLB2' });
  });

  it('dois anúncios com o mesmo GTIN na mesma devolução: só o 1º SKU (em ordem) fica com o EAN', async () => {
    await aplicarReclamacao(db, reclamacaoCom(['b-02', 'a-01'], [anuncio({ sku: 'b-02', mlItemId: 'MLB2' }), anuncio({ sku: 'a-01', mlItemId: 'MLB1' })]).dados, AGORA);
    expect(await produtoDoSku('A-01')).toMatchObject({ ean: EAN });
    expect(await produtoDoSku('B-02')).toMatchObject({ ean: null });
  });

  it('a nova sincronização de uma devolução antiga (de antes dos produtos do ML) liga os itens ainda sem produto', async () => {
    const { d, dados } = reclamacaoCom(['fone-01', 'cabo-02'], []);
    const devolucaoId = idDa(await aplicarReclamacao(db, dados, AGORA));
    expect(await ligacoes(devolucaoId)).toEqual([
      ['FONE-01', null],
      ['CABO-02', null],
    ]);
    // CABO-02 entrou no cadastro sem ligar os itens (como um produto gravado direto no banco).
    const [cabo] = await db.insert(produtos).values({ sku: 'CABO-02', descricao: 'Cabo' }).returning({ id: produtos.id });
    const r = await aplicarReclamacao(db, dadosDevolucaoMLTeste({ ...d, statusCanal: 'delivered/delivered' }, { produtos: [anuncio()] }), AGORA);
    expect(r).toMatchObject({ acao: 'atualizada', devolucaoId });
    const fone = await produtoDoSku('FONE-01');
    expect(await ligacoes(devolucaoId)).toEqual([
      ['FONE-01', fone.id],
      ['CABO-02', cabo.id],
    ]);
  });

  it('não troca a ligação que já existe', async () => {
    const outro = await criarProdutoTeste(db, { sku: 'OUTRO-SKU' });
    const { d, dados } = reclamacaoCom(['fone-01'], []);
    const devolucaoId = idDa(await aplicarReclamacao(db, dados, AGORA));
    await db.update(itensDevolucao).set({ produtoEsperadoId: outro }).where(eq(itensDevolucao.devolucaoId, devolucaoId));
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { produtos: [anuncio()] }), AGORA);
    expect(await ligacoes(devolucaoId)).toEqual([['FONE-01', outro]]);
  });

  it('devolução manual vinculada ao ML (D9): cadastra o produto e liga os itens dela', async () => {
    const operador = await criarUsuarioTeste(db);
    // O formulário e a planilha gravam o SKU já normalizado (validarNovaDevolucao).
    const manual = await criarDevolucaoTeste(db, operador, { canal: 'MERCADO_LIVRE', pedido: 'P-MANUAL', itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    const { dados } = reclamacaoCom(['fone-01'], [anuncio()], { pedidos: ['P-MANUAL'] });
    expect(await aplicarReclamacao(db, dados, AGORA)).toMatchObject({ acao: 'vinculada', devolucaoId: manual.id });
    expect(await ligacoes(manual.id)).toEqual([['FONE-01', (await produtoDoSku('FONE-01')).id]]);
  });

  it('sem título não cadastra (a descrição é obrigatória), SKU de mais de 60 caracteres também não; a devolução entra igual', async () => {
    const longo = 'S'.repeat(61);
    const { dados } = reclamacaoCom(['fone-01', longo], [anuncio({ descricao: null }), anuncio({ sku: longo, mlItemId: 'MLB2' })]);
    const devolucaoId = idDa(await aplicarReclamacao(db, dados, AGORA));
    expect(await db.select().from(produtos)).toEqual([]);
    expect((await ligacoes(devolucaoId)).map(([, p]) => p)).toEqual([null, null]);
  });

  it('o mesmo SKU em dois itens vira um produto só', async () => {
    await aplicarReclamacao(db, reclamacaoCom(['fone-01', 'FONE-01 '], [anuncio(), anuncio({ sku: 'FONE-01 ', mlItemId: 'MLB2' })]).dados, AGORA);
    expect(await db.select({ sku: produtos.sku, mlItemId: produtos.mlItemId }).from(produtos)).toEqual([{ sku: 'FONE-01', mlItemId: 'MLB3456789012' }]);
  });

  it('reclamação só de consulta (low_cost) não cadastra produto', async () => {
    const { dados } = reclamacaoCom(['fone-01'], [anuncio()], { semEnvioFisico: true });
    expect(await aplicarReclamacao(db, dados, AGORA)).toMatchObject({ acao: 'so_consulta' });
    expect(await db.select().from(produtos)).toEqual([]);
    expect(await db.select().from(devolucoes)).toEqual([]);
  });

  it('sincronizar de novo não cadastra outra vez nem repete o evento', async () => {
    const { d, dados } = reclamacaoCom(['fone-01'], [anuncio()]);
    await aplicarReclamacao(db, dados, AGORA);
    await aplicarReclamacao(db, dadosDevolucaoMLTeste(d, { produtos: [anuncio({ fotoUrl: OUTRA_FOTO })] }), AGORA);
    expect(await db.select().from(produtos)).toHaveLength(1);
    expect((await produtoDoSku('FONE-01')).fotoUrl).toBe(FOTO);
    expect(await db.select({ acao: eventosHistorico.acao }).from(eventosHistorico).where(eq(eventosHistorico.entidade, 'produto'))).toEqual([
      { acao: 'ml_produto_criado' },
    ]);
  });

  it('liga os itens de TODAS as devoluções do mesmo SKU ainda não lidas (manual de outro canal), como criarProduto', async () => {
    const operador = await criarUsuarioTeste(db);
    const outra = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'P-SHOPEE', itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    expect(await ligacoes(outra.id)).toEqual([['FONE-01', null]]);
    await aplicarReclamacao(db, reclamacaoCom(['fone-01'], [anuncio()]).dados, AGORA);
    expect(await ligacoes(outra.id)).toEqual([['FONE-01', (await produtoDoSku('FONE-01')).id]]);
  });

  it('item já lido (ean_lido) sem produto continua sem ligação e não vira divergente', async () => {
    const operador = await criarUsuarioTeste(db);
    const outra = await criarDevolucaoTeste(db, operador, { canal: 'SHOPEE', pedido: 'P-SHOPEE', itens: [{ sku: 'FONE-01', quantidade: 1 }] });
    await db.update(itensDevolucao).set({ eanLido: EAN }).where(eq(itensDevolucao.devolucaoId, outra.id));
    await aplicarReclamacao(db, reclamacaoCom(['fone-01'], [anuncio()]).dados, AGORA);
    expect(await ligacoes(outra.id)).toEqual([['FONE-01', null]]);
    const conf = await obterConferencia(db, { id: outra.id });
    expect(conf?.itens[0].divergente).toBe(false);
  });

  it('erro no cadastro do produto não impede a sincronização da reclamação (savepoint)', async () => {
    const { dados } = reclamacaoCom(['fone-01'], [anuncio({ mlItemId: 'MLB\u0000' })]);
    const r = await aplicarReclamacao(db, dados, AGORA);
    expect(r).toMatchObject({ acao: 'criada' });
    expect(await db.select().from(produtos)).toEqual([]);
    expect(await ligacoes(idDa(r))).toEqual([['FONE-01', null]]);
  });
});
