import { CODIGO_UF, montarChave } from '@/modules/fiscal/chave';
import { ErroEmissorRecusou } from './erros';
import type { EmissorNFe, NotaParaEmissao, SituacaoNota } from './tipos';

/** O que o falso lembra de cada `ref`, na memória do processo (quem emite e consulta é o worker). */
type EstadoFalso = { consultas: number; rejeitar: boolean; chave: string; numero: string; cancelada: boolean };

/** A série que o falso devolve (a EMPRESA_TESTE usa a mesma, para a conferência de série não avisar nos testes). */
export const SERIE_FALSA = '1';
const PREFIXO = 'falso://';

/** PDF mínimo de uma página, com o texto "DANFE simulado". */
const PDF_FALSO = [
  '%PDF-1.4',
  '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
  '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
  '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj',
  '4 0 obj<</Length 45>>stream',
  'BT /F1 12 Tf 20 50 Td (DANFE simulado) Tj ET',
  'endstream endobj',
  '5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj',
  'trailer<</Root 1 0 R>>',
  '%%EOF',
].join('\n');

/**
 * Emissor falso (contrato §5.3), usado no desenvolvimento, nos testes e no e2e. Autoriza na 2ª consulta; rejeita quando a
 * natureza da operação contém "REJEITAR"; recusa o cancelamento quando a justificativa contém "RECUSAR". O `lerEnv`
 * recusa `EMISSOR_NFE=falso` em produção (D17).
 */
export class EmissorFalso implements EmissorNFe {
  private readonly notas = new Map<string, EstadoFalso>();

  async emitir(nota: NotaParaEmissao): Promise<{ referencia: string }> {
    const atual = this.notas.get(nota.referencia);
    // Já autorizada: igual ao 422 already_processed da Focus.
    if (atual && !atual.rejeitar && atual.consultas >= 2) return { referencia: nota.referencia };
    // Número e código saem do próprio ref: o mesmo ref gera a mesma chave, mesmo depois de o worker reiniciar.
    const numero = String(Number.parseInt(nota.referencia.slice(0, 7), 16) % 999_999_999 || 1);
    const codigo = String(Number.parseInt(nota.referencia.slice(7, 14), 16) % 100_000_000);
    this.notas.set(nota.referencia, {
      consultas: 0,
      rejeitar: nota.naturezaOperacao.toUpperCase().includes('REJEITAR'),
      chave: montarChave({
        uf: CODIGO_UF[nota.emitente.uf] ? nota.emitente.uf : 'SP',
        emitidaEm: new Date(),
        cnpj: nota.emitente.cnpj.replace(/\D/g, ''),
        serie: SERIE_FALSA,
        numero,
        codigo,
      }),
      numero,
      cancelada: false,
    });
    return { referencia: nota.referencia };
  }

  async consultar(referencia: string): Promise<SituacaoNota> {
    const nota = this.notas.get(referencia);
    if (!nota) {
      return { situacao: 'REJEITADA', codigo: null, motivo: 'Nota desconhecida no emissor simulado (o worker reiniciou?): use "Corrigir e reenviar".' };
    }
    if (nota.cancelada) return { situacao: 'CANCELADA', urlXmlCancelamento: `${PREFIXO}cancelamento/${nota.chave}` };
    nota.consultas += 1;
    if (nota.rejeitar) return { situacao: 'REJEITADA', codigo: '999', motivo: 'Rejeição simulada: a natureza da operação contém REJEITAR' };
    if (nota.consultas < 2) return { situacao: 'PROCESSANDO' };
    return {
      situacao: 'AUTORIZADA',
      chave: nota.chave,
      numero: nota.numero,
      serie: SERIE_FALSA,
      urlXml: `${PREFIXO}xml/${nota.chave}`,
      urlDanfe: `${PREFIXO}danfe/${nota.chave}`,
    };
  }

  async cancelar(referencia: string, justificativa: string): Promise<SituacaoNota> {
    if (justificativa.toUpperCase().includes('RECUSAR')) {
      return { situacao: 'CANCELAMENTO_RECUSADO', motivo: 'Cancelamento recusado (simulação): a justificativa contém RECUSAR' };
    }
    // O cancelamento roda no servidor web; quem emitiu foi o worker. Sem o estado, o arquivo sai pela referência.
    const nota = this.notas.get(referencia);
    if (nota) nota.cancelada = true;
    return { situacao: 'CANCELADA', urlXmlCancelamento: `${PREFIXO}cancelamento/${nota?.chave ?? referencia}` };
  }

  async baixar(url: string): Promise<Buffer> {
    const partes = /^falso:\/\/(xml|danfe|cancelamento)\/([0-9a-z]+)$/i.exec(url);
    if (!partes) throw new ErroEmissorRecusou(`Endereço desconhecido no emissor simulado: ${url}`);
    const [, tipo, id] = partes;
    if (tipo === 'danfe') return Buffer.from(PDF_FALSO, 'latin1');
    if (tipo === 'xml') {
      return Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${id}" versao="4.00"><ide><mod>55</mod><tpNF>0</tpNF><finNFe>4</finNFe></ide></infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>${id}</chNFe><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e (simulado)</xMotivo></infProt></protNFe></nfeProc>`,
        'utf8',
      );
    }
    return Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento><infEvento><chNFe>${id}</chNFe><tpEvento>110111</tpEvento></infEvento></evento><retEvento><infEvento><cStat>135</cStat><xMotivo>Evento registrado (simulado)</xMotivo></infEvento></retEvento></procEventoNFe>`,
      'utf8',
    );
  }
}
