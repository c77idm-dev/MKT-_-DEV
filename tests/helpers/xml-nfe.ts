import { dataFocus } from '@/conectores/nfe/focus-mapeamento';
import { montarChave } from '@/modules/fiscal/chave';

/** Gera o XML autorizado (procNFe) de uma NF de venda, para os testes. Por padrão: emitida pela EMPRESA_TESTE para uma pessoa física de SP. */

export type ItemXmlTeste = {
  codigo: string;
  ean?: string | null;
  descricao?: string;
  ncm?: string;
  quantidade?: number;
  valorUnitario?: number;
  desconto?: number;
  /** true: ICMS CST 00 (18%) e PIS/COFINS CST 01 com valores. false (padrão): Simples, CSOSN 102 e PIS/COFINS não tributados. */
  tributado?: boolean;
};

export type OpcoesXmlVenda = {
  cnpjEmitente?: string;
  ufEmitente?: string;
  numero?: number;
  serie?: number;
  emitidaEm?: Date;
  destinatario?: {
    nome?: string;
    cpf?: string | null;
    cnpj?: string | null;
    ie?: string | null;
    indIEDest?: '1' | '2' | '9';
    logradouro?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
  };
  itens: ItemXmlTeste[];
  comProtocolo?: boolean;
  cStat?: string;
  modelo?: string;
  tpNF?: '0' | '1';
};

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const f2 = (n: number) => n.toFixed(2);

export function xmlNotaVendaTeste(o: OpcoesXmlVenda): { xml: string; chave: string } {
  const emitidaEm = o.emitidaEm ?? new Date('2026-10-20T13:00:00Z');
  const numero = String(o.numero ?? 101);
  const serie = String(o.serie ?? 1);
  const cnpj = o.cnpjEmitente ?? '11444777000161';
  const ufEmitente = o.ufEmitente ?? 'SP';
  const modelo = o.modelo ?? '55';
  const chave = montarChave({ uf: ufEmitente, emitidaEm, cnpj, modelo, serie, numero, codigo: numero.padStart(8, '0') });
  const d = {
    nome: 'Maria da Silva',
    cpf: '52998224725' as string | null,
    cnpj: null as string | null,
    ie: null as string | null,
    indIEDest: '9',
    logradouro: 'Rua B',
    numero: '50',
    bairro: 'Jardim',
    cidade: 'Sao Paulo',
    uf: 'SP',
    cep: '01002000',
    ...o.destinatario,
  };
  const dets = o.itens
    .map((item, i) => {
      const q = item.quantidade ?? 1;
      const vu = item.valorUnitario ?? 100;
      const vProd = q * vu;
      const imposto = item.tributado
        ? `<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${f2(vProd)}</vBC><pICMS>18.00</pICMS><vICMS>${f2(vProd * 0.18)}</vICMS></ICMS00></ICMS>` +
          `<PIS><PISAliq><CST>01</CST><vBC>${f2(vProd)}</vBC><pPIS>0.65</pPIS><vPIS>${f2(vProd * 0.0065)}</vPIS></PISAliq></PIS>` +
          `<COFINS><COFINSAliq><CST>01</CST><vBC>${f2(vProd)}</vBC><pCOFINS>3.00</pCOFINS><vCOFINS>${f2(vProd * 0.03)}</vCOFINS></COFINSAliq></COFINS>`
        : '<ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS><PIS><PISNT><CST>07</CST></PISNT></PIS><COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>';
      const cfop = d.uf === ufEmitente ? '5102' : '6102';
      return (
        `<det nItem="${i + 1}"><prod><cProd>${escapar(item.codigo)}</cProd><cEAN>${item.ean ?? 'SEM GTIN'}</cEAN>` +
        `<xProd>${escapar(item.descricao ?? `Produto ${item.codigo}`)}</xProd><NCM>${item.ncm ?? '85183000'}</NCM><CFOP>${cfop}</CFOP>` +
        `<uCom>UN</uCom><qCom>${q.toFixed(4)}</qCom><vUnCom>${vu.toFixed(10)}</vUnCom><vProd>${f2(vProd)}</vProd>` +
        `${item.desconto ? `<vDesc>${f2(item.desconto)}</vDesc>` : ''}</prod><imposto>${imposto}</imposto></det>`
      );
    })
    .join('');
  const documento = d.cpf ? `<CPF>${d.cpf}</CPF>` : `<CNPJ>${d.cnpj ?? ''}</CNPJ>`;
  const nfe =
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${chave}" versao="4.00">` +
    `<ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp><mod>${modelo}</mod><serie>${serie}</serie><nNF>${numero}</nNF>` +
    `<dhEmi>${dataFocus(emitidaEm)}</dhEmi><tpNF>${o.tpNF ?? '1'}</tpNF><finNFe>1</finNFe><indFinal>1</indFinal></ide>` +
    `<emit><CNPJ>${cnpj}</CNPJ><xNome>Empresa Teste Ltda</xNome><enderEmit><UF>${ufEmitente}</UF></enderEmit><IE>110042490114</IE></emit>` +
    `<dest>${documento}<xNome>${escapar(d.nome)}</xNome><enderDest><xLgr>${escapar(d.logradouro)}</xLgr><nro>${d.numero}</nro>` +
    `<xBairro>${escapar(d.bairro)}</xBairro><xMun>${escapar(d.cidade)}</xMun><UF>${d.uf}</UF><CEP>${d.cep}</CEP></enderDest>` +
    `<indIEDest>${d.indIEDest}</indIEDest>${d.ie ? `<IE>${d.ie}</IE>` : ''}</dest>${dets}</infNFe></NFe>`;
  const cabecalho = '<?xml version="1.0" encoding="UTF-8"?>';
  const xml =
    o.comProtocolo === false
      ? `${cabecalho}${nfe}`
      : `${cabecalho}<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${nfe}` +
        `<protNFe versao="4.00"><infProt><chNFe>${chave}</chNFe><cStat>${o.cStat ?? '100'}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`;
  return { xml, chave };
}
