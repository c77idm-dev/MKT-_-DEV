import { Readable } from 'node:stream';
import { obterArmazenamento } from '@/modules/midia/armazenamento';

const ANO_MES = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });

/** Contrato §5.2: `nfe/{aaaa}/{mm}/{notaFiscalId}` (mês da autorização, horário de Brasília). Some `.xml`, `-danfe.pdf` ou `-cancelamento.xml`. */
export function caminhoBaseNfe(notaFiscalId: string, autorizadaEm: Date): string {
  const partes = Object.fromEntries(ANO_MES.formatToParts(autorizadaEm).map((p) => [p.type, p.value]));
  return `nfe/${partes.year}/${partes.month}/${notaFiscalId}`;
}

/** Contrato §5.2: `notas-venda/{devolucaoId}/{notaVendaId}.xml`. */
export function caminhoNotaVenda(devolucaoId: string, notaVendaId: string): string {
  return `notas-venda/${devolucaoId}/${notaVendaId}.xml`;
}

export async function salvarArquivo(caminho: string, conteudo: Buffer, tipoConteudo: string): Promise<void> {
  // Readable.from de um Buffer não itera byte a byte: o Buffer vai inteiro, num pedaço só.
  await obterArmazenamento().salvar(caminho, Readable.from(conteudo), { tipoConteudo, tamanho: conteudo.length });
}

export async function lerArquivo(caminho: string): Promise<Buffer> {
  const fluxo = await obterArmazenamento().ler(caminho);
  const partes: Buffer[] = [];
  for await (const parte of fluxo) partes.push(Buffer.isBuffer(parte) ? parte : Buffer.from(parte as string));
  return Buffer.concat(partes);
}
