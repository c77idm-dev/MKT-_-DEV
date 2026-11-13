import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Destinatario } from '@/conectores/nfe/tipos';
import { somenteDigitos } from '@/modules/catalogo/documentos';
import { chaveValida } from './chave';
import type { ItemNotaVenda, TributosUnitarios } from './dominio';
import { ErroFiscal } from './erros';

/** 1 MB: um XML de NF-e tem dezenas de KB; acima disso não é a NF de venda. */
export const TAMANHO_MAXIMO_XML = 1_000_000;

export type DadosNotaVenda = {
  chave: string;
  emitidaEm: Date | null;
  cnpjEmitente: string;
  destinatario: Destinatario;
  itens: ItemNotaVenda[];
};

type No = Record<string, unknown>;

const leitor = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  // Tudo como texto: chave, CNPJ, NCM e CEP têm zeros à esquerda.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  isArray: (nome) => nome === 'det',
  // O XML vem de fora: entidades do DOCTYPE não são expandidas; as padrão (&amp;) continuam valendo.
  processEntities: { enabled: true, maxEntityCount: 0 },
});

function no(valor: unknown): No | null {
  return valor !== null && typeof valor === 'object' && !Array.isArray(valor) ? (valor as No) : null;
}
function texto(valor: unknown): string {
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number') return String(valor);
  return '';
}
function numero(valor: unknown, campo: string): number {
  const t = texto(valor);
  if (t === '') return 0;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new ErroFiscal(`Valor inválido no XML (${campo}): ${t}`);
  return n;
}
function opcional(valor: unknown): number | undefined {
  const t = texto(valor);
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
/** ICMS, PIS e COFINS têm um subgrupo só (ICMS00, ICMSSN102, PISAliq...): pega o primeiro. */
function primeiroGrupo(valor: unknown): No {
  const grupo = no(valor);
  if (!grupo) return {};
  for (const filho of Object.values(grupo)) {
    const g = no(filho);
    if (g) return g;
  }
  return {};
}
function semIndefinidos(t: TributosUnitarios): TributosUnitarios {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)) as TributosUnitarios;
}

function lerDestinatario(dest: No | null): Destinatario {
  if (!dest) throw new ErroFiscal('A NF de venda não tem destinatário.');
  const endereco = no(dest.enderDest) ?? {};
  const cpf = somenteDigitos(texto(dest.CPF)) || null;
  const cnpj = texto(dest.CNPJ).toUpperCase() || null;
  const indicador = texto(dest.indIEDest);
  const d: Destinatario = {
    nome: texto(dest.xNome),
    cpf,
    cnpj,
    ie: texto(dest.IE) || null,
    indicadorIe: indicador === '1' ? 1 : indicador === '2' ? 2 : 9,
    logradouro: texto(endereco.xLgr),
    numero: texto(endereco.nro) || 'S/N',
    complemento: texto(endereco.xCpl) || null,
    bairro: texto(endereco.xBairro),
    cidade: texto(endereco.xMun),
    uf: texto(endereco.UF).toUpperCase(),
    cep: somenteDigitos(texto(endereco.CEP)),
  };
  const faltando = [
    d.nome ? null : 'nome',
    cpf || cnpj ? null : 'CPF ou CNPJ',
    d.logradouro ? null : 'logradouro',
    d.bairro ? null : 'bairro',
    d.cidade ? null : 'município',
    /^[A-Z]{2}$/.test(d.uf) ? null : 'UF',
  ].filter((x): x is string => x !== null);
  if (faltando.length > 0) throw new ErroFiscal(`A NF de venda não traz estes dados do destinatário: ${faltando.join(', ')}.`);
  return d;
}

function lerItem(det: No, indice: number): ItemNotaVenda {
  const prod = no(det.prod) ?? {};
  const imposto = no(det.imposto) ?? {};
  const numeroItem = Number(texto(det['@_nItem'])) || indice + 1;
  const quantidade = numero(prod.qCom, `qCom do item ${numeroItem}`);
  if (quantidade <= 0) throw new ErroFiscal(`O item ${numeroItem} da NF de venda tem quantidade zero.`);
  const porUnidade = (valor: number | undefined) => (valor === undefined ? undefined : valor / quantidade);
  const icms = primeiroGrupo(imposto.ICMS);
  const pis = primeiroGrupo(imposto.PIS);
  const cofins = primeiroGrupo(imposto.COFINS);
  const ean = texto(prod.cEAN);
  return {
    numero: numeroItem,
    codigo: texto(prod.cProd),
    ean: /^\d{8,14}$/.test(ean) ? ean : null,
    descricao: texto(prod.xProd),
    ncm: somenteDigitos(texto(prod.NCM)),
    cfop: texto(prod.CFOP),
    unidade: texto(prod.uCom) || 'UN',
    quantidade,
    valorUnitario: numero(prod.vUnCom, `vUnCom do item ${numeroItem}`),
    desconto: numero(prod.vDesc, `vDesc do item ${numeroItem}`),
    origem: Number(texto(icms.orig)) || 0,
    tributosPorUnidade: semIndefinidos({
      icmsBase: porUnidade(opcional(icms.vBC)),
      icmsAliquota: opcional(icms.pICMS),
      icmsValor: porUnidade(opcional(icms.vICMS)),
      pisBase: porUnidade(opcional(pis.vBC)),
      pisAliquota: opcional(pis.pPIS),
      pisValor: porUnidade(opcional(pis.vPIS)),
      cofinsBase: porUnidade(opcional(cofins.vBC)),
      cofinsAliquota: opcional(cofins.pCOFINS),
      cofinsValor: porUnidade(opcional(cofins.vCOFINS)),
    }),
    itensDevolucaoIds: [],
  };
}

/**
 * Lê o XML autorizado da NF de venda (spec §7.5): chave, emitente, destinatário (só o necessário à NF, LGPD) e itens com
 * valores e tributos por unidade. Lança ErroFiscal com a mensagem para a tela.
 */
export function interpretarXmlNotaVenda(xml: string): DadosNotaVenda {
  if (Buffer.byteLength(xml, 'utf8') > TAMANHO_MAXIMO_XML) throw new ErroFiscal('O XML passa de 1 MB: confira se é o arquivo da NF de venda.');
  if (XMLValidator.validate(xml) !== true) throw new ErroFiscal('O arquivo não é um XML válido.');
  const raiz = no(leitor.parse(xml)) ?? {};
  const proc = no(raiz.nfeProc);
  const nfe = no(proc ? proc.NFe : raiz.NFe);
  const inf = no(nfe?.infNFe);
  if (!inf) throw new ErroFiscal('O XML não é de uma NF-e (falta o grupo infNFe).');
  const chave = texto(inf['@_Id']).replace(/^NFe/, '');
  if (!chaveValida(chave)) throw new ErroFiscal('A chave de acesso do XML é inválida.');
  const ide = no(inf.ide) ?? {};
  if (texto(ide.mod) !== '55') throw new ErroFiscal('O XML não é de uma NF-e (modelo 55).');
  if (texto(ide.tpNF) !== '1') throw new ErroFiscal('A nota do XML não é de saída: anexe a NF de venda.');
  const cStat = texto(no(no(proc?.protNFe)?.infProt)?.cStat);
  if (cStat !== '100' && cStat !== '150') throw new ErroFiscal('O XML não traz a autorização da SEFAZ: use o XML autorizado (com o protocolo).');
  const destinatario = lerDestinatario(no(inf.dest));
  const dets = Array.isArray(inf.det) ? inf.det : [];
  if (dets.length === 0) throw new ErroFiscal('A NF de venda não tem itens.');
  const itens = dets.map((det, i) => lerItem(no(det) ?? {}, i));
  const dhEmi = texto(ide.dhEmi);
  return {
    chave,
    emitidaEm: dhEmi && !Number.isNaN(Date.parse(dhEmi)) ? new Date(dhEmi) : null,
    cnpjEmitente: texto(no(inf.emit)?.CNPJ).toUpperCase(),
    destinatario,
    itens,
  };
}
