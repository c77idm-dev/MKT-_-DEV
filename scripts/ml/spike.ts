import { mkdir, writeFile } from 'node:fs/promises';
import { criarClienteML, ErroML, type ClienteML } from '@/conectores/marketplace/mercadolivre/cliente';
import { formatarDataML } from '@/conectores/marketplace/mercadolivre/datas';
import { redigir } from '@/lib/redigir';
import { obterTokensValidos } from './comum';
import { idsDaDevolucao, reclamacoesComDevolucao, resumirCorpoErro, type DevolucaoML, type ReclamacaoResumo } from './selecao';

const PASTA = 'tests/fixtures/ml';
const DIAS = 60;
const MAX_RECLAMACOES = 5;
const NOVO_FORMATO = { 'x-format-new': 'true' };

type Passo = { passo: string; caminho: string; status: number | 'erro'; arquivo?: string; observacao?: string };
const relatorio: Passo[] = [];

/** Chama a API, grava a resposta sem dados pessoais e registra o resultado no relatório. Nunca interrompe o teste. */
async function chamar(
  cliente: ClienteML,
  passo: string,
  caminho: string,
  arquivo: string,
  cabecalhos?: Record<string, string>,
): Promise<unknown> {
  try {
    const dados = await cliente.get(caminho, cabecalhos);
    await writeFile(`${PASTA}/${arquivo}`, `${JSON.stringify(redigir(dados), null, 2)}\n`, 'utf8');
    relatorio.push({ passo, caminho, status: 200, arquivo });
    return dados;
  } catch (erro) {
    if (erro instanceof ErroML) {
      relatorio.push({ passo, caminho, status: erro.status, observacao: resumirCorpoErro(erro.corpo) });
    } else {
      relatorio.push({ passo, caminho, status: 'erro', observacao: String(erro) });
    }
    return null;
  }
}

async function main() {
  const tokens = await obterTokensValidos();
  const cliente = criarClienteML({ accessToken: tokens.accessToken });
  const vendedor = tokens.userId;
  await mkdir(PASTA, { recursive: true });

  const desde = formatarDataML(new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000));
  const busca = (await chamar(
    cliente,
    'buscar reclamações',
    `/post-purchase/v1/claims/search?players.user_id=${vendedor}&players.role=respondent&range=last_updated:after:${desde}&limit=50`,
    'claims-search.json',
  )) as { data?: ReclamacaoResumo[] } | null;

  const selecionadas = reclamacoesComDevolucao(busca?.data ?? [], MAX_RECLAMACOES);
  for (const [i, reclamacao] of selecionadas.entries()) {
    const n = i + 1;
    await chamar(cliente, 'reclamação', `/post-purchase/v1/claims/${reclamacao.id}`, `claim-${n}.json`);
    const resposta = await chamar(cliente, 'devolução (v2)', `/post-purchase/v2/claims/${reclamacao.id}/returns`, `return-${n}.json`);
    const devolucoes = (Array.isArray(resposta) ? resposta : resposta ? [resposta] : []) as DevolucaoML[];

    for (const devolucao of devolucoes) {
      const { pedidos, envios } = idsDaDevolucao(devolucao);
      for (const [k, envio] of envios.entries()) {
        const base = `shipment-${n}-${k + 1}`;
        await chamar(cliente, 'envio da devolução', `/shipments/${envio}`, `${base}.json`, NOVO_FORMATO);
        await chamar(cliente, 'histórico do envio', `/shipments/${envio}/history`, `${base}-history.json`, NOVO_FORMATO);
        await chamar(cliente, 'transportadora do envio', `/shipments/${envio}/carrier`, `${base}-carrier.json`, NOVO_FORMATO);
      }
      for (const [k, pedido] of pedidos.entries()) {
        const base = `order-${n}-${k + 1}`;
        await chamar(cliente, 'pedido', `/orders/${pedido}`, `${base}.json`);
        await chamar(cliente, 'NF do pedido (variante A)', `/users/${vendedor}/invoices/orders/${pedido}`, `${base}-invoice-a.json`);
        await chamar(cliente, 'NF do pedido (variante B)', `/invoices/orders/${pedido}`, `${base}-invoice-b.json`);
      }
    }
  }

  await writeFile(
    `${PASTA}/RELATORIO.json`,
    `${JSON.stringify({ geradoEm: new Date().toISOString(), diasAnalisados: DIAS, reclamacoesAnalisadas: selecionadas.length, passos: relatorio }, null, 2)}\n`,
    'utf8',
  );
  console.table(relatorio.map(({ passo, status, arquivo }) => ({ passo, status, arquivo: arquivo ?? '' })));
  if (selecionadas.length === 0) {
    console.warn(`Nenhuma reclamação com devolução nos últimos ${DIAS} dias. Rode de novo quando houver alguma.`);
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
