import { idsDosProdutos } from '@/modules/catalogo/produtos';
import { interpretarCanal } from '@/modules/devolucoes/canais';
import {
  chavePedido,
  codigosAtivosPorPedido,
  codigosNaoIdentificadosPorRastreio,
  criarDevolucao,
  mensagemRastreioNaoIdentificado,
  validarNovaDevolucao,
  type DadosNovaDevolucao,
} from '@/modules/devolucoes/criar';
import { LIMITE_QUANTIDADE, LIMITE_UNIDADES_DEVOLUCAO, type Canal } from '@/modules/devolucoes/dominio';
import { ErroDevolucao } from '@/modules/devolucoes/erros';
import { ErroTransicao } from '@/modules/devolucoes/transicoes';
import { normalizarRastreio } from '@/modules/devolucoes/rastreio';
import { dadosOuErro, type DefinicaoImportacao } from '../definicao';
import type { LinhaPulada } from '../tipos';

function interpretarLinha(v: Record<string, string>) {
  return validarNovaDevolucao({
    canal: v.canal ?? '',
    pedido: v.numero_pedido ?? '',
    reclamacaoId: v.id_reclamacao,
    rastreio: v.rastreio,
    transportadora: v.transportadora,
    motivoCliente: v.motivo_cliente,
    postadaEm: v.data_postagem,
    itens: [{ sku: v.sku ?? '', quantidade: v.quantidade ?? '' }],
  });
}

/** Linhas com o mesmo canal, pedido, rastreio e reclamação são o mesmo pacote: viram uma devolução só. */
function chaveDaLinha(v: Record<string, string>): string {
  const canalTexto = (v.canal ?? '').trim();
  return [
    interpretarCanal(canalTexto) ?? canalTexto.toUpperCase(),
    (v.numero_pedido ?? '').trim(),
    normalizarRastreio(v.rastreio ?? ''),
    (v.id_reclamacao ?? '').trim(),
  ].join('|');
}

type CampoDoPacote = 'transportadora' | 'motivoCliente' | 'postadaEm';
const CAMPOS_DO_PACOTE: { campo: CampoDoPacote; rotulo: string }[] = [
  { campo: 'transportadora', rotulo: 'transportadora' },
  { campo: 'motivoCliente', rotulo: 'motivo do cliente' },
  { campo: 'postadaEm', rotulo: 'data de postagem' },
];

/** Junta as linhas válidas de um pacote: campos soltos valem pelo primeiro preenchido; um item por linha, na ordem. */
function juntarPacote(linhas: DadosNovaDevolucao[]): DadosNovaDevolucao {
  const base = { ...linhas[0], itens: linhas.flatMap((d) => d.itens) };
  for (const { campo } of CAMPOS_DO_PACOTE) base[campo] = linhas.map((d) => d[campo]).find((v) => v !== null) ?? null;
  return base;
}

/** Modelo sugerido da spec §6.1: canal, numero_pedido, id_reclamacao, rastreio, transportadora, sku, quantidade, motivo_cliente, data_postagem. */
export const definicaoDevolucoes: DefinicaoImportacao = {
  tipo: 'devolucoes',
  titulo: 'Devoluções',
  acao: 'operar_devolucoes',
  voltarPara: '/fluxo/etapa/1',
  rotuloCriados: 'Devoluções criadas',
  rotuloAtualizados: null,
  campos: [
    { chave: 'canal', rotulo: 'Canal (marketplace)', obrigatorio: true, sinonimos: ['marketplace', 'canal', 'loja', 'origem', 'plataforma'] },
    { chave: 'numero_pedido', rotulo: 'Número do pedido', obrigatorio: true, sinonimos: ['pedido', 'numero do pedido', 'n do pedido', 'id do pedido', 'order id'] },
    { chave: 'id_reclamacao', rotulo: 'ID da reclamação', obrigatorio: false, sinonimos: ['reclamacao', 'id reclamacao', 'mediacao', 'id da mediacao', 'claim'] },
    { chave: 'rastreio', rotulo: 'Código de rastreamento', obrigatorio: false, sinonimos: ['rastreio', 'rastreamento', 'codigo de rastreio', 'tracking', 'objeto'] },
    { chave: 'transportadora', rotulo: 'Transportadora', obrigatorio: false, sinonimos: ['transportadora', 'carrier'] },
    { chave: 'sku', rotulo: 'SKU', obrigatorio: true, sinonimos: ['sku', 'codigo', 'codigo do produto', 'referencia'] },
    { chave: 'quantidade', rotulo: 'Quantidade', obrigatorio: false, sinonimos: ['quantidade', 'qtd', 'qtde', 'quant'] },
    { chave: 'motivo_cliente', rotulo: 'Motivo do cliente', obrigatorio: false, sinonimos: ['motivo', 'motivo da devolucao', 'motivo cliente'] },
    { chave: 'data_postagem', rotulo: 'Data de postagem', obrigatorio: false, sinonimos: ['postagem', 'data postagem', 'data de envio'] },
  ],

  async validar(db, linhas) {
    const itens = linhas.map((linha) => ({ linha, chave: chaveDaLinha(linha.valores), ...interpretarLinha(linha.valores) }));
    const erros = itens.map((i) => [...i.erros]);
    const avisos = itens.map((): string[] => []);

    const grupos = new Map<string, number[]>();
    itens.forEach((item, i) => grupos.set(item.chave, [...(grupos.get(item.chave) ?? []), i]));

    // O pedido de cada grupo (quando ao menos uma linha dele é válida).
    const pedidos: { indices: number[]; canal: Canal; pedido: string }[] = [];
    for (const indices of grupos.values()) {
      const dados = indices.map((i) => itens[i].dados).find((d) => d !== null);
      if (dados) pedidos.push({ indices, canal: dados.canal, pedido: dados.pedido });
    }

    // O mesmo pedido em dois pacotes diferentes (outro rastreio ou outra reclamação).
    const primeiraLinhaDoPedido = new Map<string, number>();
    for (const p of pedidos) {
      const chave = chavePedido(p.canal, p.pedido);
      const anterior = primeiraLinhaDoPedido.get(chave);
      if (anterior !== undefined) {
        p.indices.forEach((i) => erros[i].push(`aparece com outro rastreio ou reclamação na linha ${anterior}`));
      } else {
        primeiraLinhaDoPedido.set(chave, itens[p.indices[0]].linha.numeroLinha);
      }
    }

    // O pedido já tem devolução em andamento (uma planilha enviada duas vezes não duplica).
    const ativos = await codigosAtivosPorPedido(db, pedidos.map(({ canal, pedido }) => ({ canal, pedido })));
    for (const p of pedidos) {
      const codigo = ativos.get(chavePedido(p.canal, p.pedido));
      if (codigo) p.indices.forEach((i) => erros[i].push(`já existe a devolução ${codigo} para este pedido neste canal`));
    }

    // O rastreio já é de um pacote não identificado ativo: a devolução certa é identificar aquele pacote.
    const rastreios = pedidos.flatMap((p) => {
      const rastreio = p.indices.map((i) => itens[i].dados?.rastreio).find((r) => r);
      return rastreio ? [{ ...p, rastreio }] : [];
    });
    const naoIdentificados = await codigosNaoIdentificadosPorRastreio(db, rastreios.map((r) => r.rastreio));
    for (const p of rastreios) {
      const codigo = naoIdentificados.get(p.rastreio);
      if (codigo) p.indices.forEach((i) => erros[i].push(mensagemRastreioNaoIdentificado(codigo)));
    }

    // SKU fora do cadastro é só aviso: a bancada não para por isso.
    const skus = [...new Set(itens.flatMap((i) => i.dados?.itens.map((x) => x.sku) ?? []))];
    const cadastrados = await idsDosProdutos(db, skus);
    itens.forEach((item, i) =>
      item.dados?.itens.forEach((x) => {
        if (!cadastrados.has(x.sku)) avisos[i].push(`SKU ${x.sku} fora do cadastro de produtos`);
      }),
    );

    for (const indices of grupos.values()) {
      // Campos soltos: vale o primeiro preenchido; outro valor diferente nas linhas seguintes vira aviso.
      for (const { campo, rotulo } of CAMPOS_DO_PACOTE) {
        let escolhida: { valor: string; linha: number } | null = null;
        for (const i of indices) {
          const valor = itens[i].dados?.[campo] ?? null;
          if (valor === null) continue;
          if (!escolhida) escolhida = { valor, linha: itens[i].linha.numeroLinha };
          else if (valor !== escolhida.valor) {
            avisos[i].push(`${rotulo} diferente da linha ${escolhida.linha}; ficou a da linha ${escolhida.linha}`);
          }
        }
      }
      // Quantidade somada por SKU dentro do pedido: o limite vale para o total.
      const totais = new Map<string, number>();
      for (const i of indices)
        for (const x of itens[i].dados?.itens ?? []) totais.set(x.sku, (totais.get(x.sku) ?? 0) + x.quantidade);
      // (extra) Limite do total de unidades do pedido: todas as linhas dele recebem o erro.
      const unidadesDoPedido = [...totais.values()].reduce((soma, q) => soma + q, 0);
      if (unidadesDoPedido > LIMITE_UNIDADES_DEVOLUCAO) {
        for (const i of indices) {
          if (itens[i].dados) erros[i].push(`o pedido soma ${unidadesDoPedido} unidades (máximo ${LIMITE_UNIDADES_DEVOLUCAO} por devolução)`);
        }
      }
      for (const [sku, total] of totais) {
        if (total <= LIMITE_QUANTIDADE) continue;
        for (const i of indices) {
          if (itens[i].dados?.itens.some((x) => x.sku === sku)) erros[i].push(`o SKU ${sku} soma ${total} unidades no pedido (máximo ${LIMITE_QUANTIDADE})`);
        }
      }
    }

    // Um pedido com qualquer linha errada fica de fora inteiro (não dá para gravar meia devolução).
    for (const indices of grupos.values()) {
      const comErro = indices.find((i) => erros[i].length > 0);
      if (comErro === undefined) continue;
      const numero = itens[comErro].linha.numeroLinha;
      indices.forEach((i) => {
        if (erros[i].length === 0) erros[i].push(`outra linha deste pedido tem erro (linha ${numero}); o pedido inteiro fica de fora`);
      });
    }

    // Cada mensagem diz de qual pedido fala (os cartões da prévia são por linha).
    return itens.map(({ linha }, i) => {
      const pedido = (linha.valores.numero_pedido ?? '').trim();
      const comPedido = (mensagem: string) => (pedido ? `Pedido ${pedido}: ${mensagem}` : mensagem);
      return { ...linha, erros: erros[i].map(comPedido), avisos: avisos[i].map(comPedido) };
    });
  },

  async aplicar(db, linhas, usuario) {
    const grupos = new Map<string, { dados: DadosNovaDevolucao[]; linhas: number[] }>();
    for (const linha of linhas) {
      const dados = dadosOuErro(interpretarLinha(linha.valores), linha.numeroLinha);
      const chave = chaveDaLinha(linha.valores);
      const grupo = grupos.get(chave) ?? { dados: [], linhas: [] };
      grupo.dados.push(dados);
      grupo.linhas.push(linha.numeroLinha);
      grupos.set(chave, grupo);
    }
    let criados = 0;
    const puladas: LinhaPulada[] = [];
    for (const grupo of grupos.values()) {
      const pacote = juntarPacote(grupo.dados);
      try {
        await criarDevolucao(db, pacote, { origem: 'PLANILHA', usuario });
        criados += 1;
      } catch (erro) {
        // Regra de negócio (ex.: o pedido ganhou devolução depois da prévia): pula só este pedido e diz por quê.
        // ErroTransicao (sem permissão) não é capturado: sobe e a confirmação inteira é desfeita.
        if (!(erro instanceof ErroDevolucao) || erro instanceof ErroTransicao) throw erro;
        for (const linha of grupo.linhas) puladas.push({ linha, erro: `Pedido ${pacote.pedido}: ${erro.message}` });
      }
    }
    return { criados, atualizados: 0, puladas };
  },
};
