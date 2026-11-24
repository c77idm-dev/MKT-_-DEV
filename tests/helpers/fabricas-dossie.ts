import type { DadosDossie, EvidenciaDossie, UnidadeDossie } from '../../src/modules/dossie/dominio';

/** Dados de um dossiê de provas (extra) para os testes do PDF: 3 unidades (Confere, Não confere, ausente), fotos e vídeo. */
export const AGORA_DOSSIE = new Date('2026-11-19T18:30:00Z'); // 15:30 em Brasília
const ENVIO = new Date('2026-11-19T13:02:00Z'); // 10:02

function evidencia(p: Partial<EvidenciaDossie> & Pick<EvidenciaDossie, 'id' | 'tipo'>): EvidenciaDossie {
  const video = p.tipo === 'VIDEO_PROVA';
  return {
    itemId: null,
    situacao: 'PRONTA',
    tipoConteudo: video ? 'video/mp4' : 'image/jpeg',
    caminho: `evidencias/dev-1/${p.id}.${video ? 'mp4' : 'jpg'}`,
    provedor: 'disco',
    enviadoEm: ENVIO,
    ...p,
  };
}

function unidade(p: Partial<UnidadeDossie> & Pick<UnidadeDossie, 'id' | 'unidade'>): UnidadeDossie {
  return {
    sku: 'FONE-01',
    status: 'AGUARDANDO_NF',
    descricao: 'Fone Bluetooth Ação',
    eanEsperado: '7891000000014',
    eanLido: null,
    divergente: false,
    produtoRecebido: null,
    serial: null,
    loteFabricacao: null,
    validade: null,
    destino: 'BOM',
    motivo: null,
    observacao: null,
    ...p,
  };
}

export function dadosDossieTeste(m: Partial<DadosDossie> = {}): DadosDossie {
  return {
    id: 'dev-1',
    codigo: 'DEV-000123',
    canal: 'MERCADO_LIVRE',
    empresa: 'Loja Exemplo Ltda',
    pedidos: ['2000009876543210'],
    reclamacaoId: '5300000001',
    devolucaoExternaId: '91000001',
    contaML: 'Loja Falsa 1',
    motivoReclamacaoML: { id: 'PDD9949', texto: 'Chegou com defeito' },
    rastreio: 'BR123456789',
    transportadora: 'Correios',
    motivoCliente: 'Produto não funciona',
    recebidaEm: new Date('2026-11-19T13:00:00Z'),
    conferenciaIniciadaEm: new Date('2026-11-19T13:01:00Z'),
    conferidaEm: new Date('2026-11-19T13:20:00Z'),
    unidades: [
      unidade({
        id: 'u1', unidade: 1, eanLido: '7891000000014', serial: 'SN-ABC-1', loteFabricacao: 'L2026', validade: '12/2027',
        destino: 'PROBLEMA', motivo: 'AVARIADO', observacao: 'Caixa amassada e tela trincada.',
      }),
      unidade({
        id: 'u2', unidade: 2, eanLido: '7891000000021', divergente: true, produtoRecebido: { sku: 'CAPA-09', descricao: 'Capa de silicone' },
        destino: 'PROBLEMA', motivo: 'DIVERGENTE',
      }),
      unidade({ id: 'u3', unidade: 3, status: 'AUSENTE', destino: null, motivo: 'AUSENTE' }),
    ],
    evidencias: [
      evidencia({ id: 'f1', tipo: 'FOTO_1_ETIQUETA' }),
      evidencia({ id: 'f2', tipo: 'FOTO_2_EMBALAGEM' }),
      evidencia({ id: 'f3u1', tipo: 'FOTO_3_PRODUTO', itemId: 'u1' }),
      evidencia({ id: 'f4u1', tipo: 'FOTO_4_CODIGO_SERIAL', itemId: 'u1' }),
      evidencia({ id: 'av1u1', tipo: 'EXTRA', itemId: 'u1' }),
      evidencia({ id: 'av2u1', tipo: 'EXTRA', itemId: 'u1' }),
      evidencia({ id: 'f3u2', tipo: 'FOTO_3_PRODUTO', itemId: 'u2' }),
      evidencia({ id: 'f4u2', tipo: 'FOTO_4_CODIGO_SERIAL', itemId: 'u2' }),
      evidencia({ id: 'video', tipo: 'VIDEO_PROVA' }),
    ],
    geradoEm: AGORA_DOSSIE,
    ...m,
  };
}
