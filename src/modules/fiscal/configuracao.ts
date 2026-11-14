import type { DadosEmitente } from '@/conectores/nfe/tipos';
import type { DbOuTx } from '@/db/client';
import { configuracoes } from '@/db/schema';
import { lerEnv, type Env } from '@/lib/env';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { normalizarCep, normalizarCnpj, normalizarUf } from '@/modules/catalogo/documentos';
import { AMBIENTES_NFE, REGIMES_TRIBUTARIOS, type AmbienteNfe, type RegimeTributario } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';
import { OPERACOES_FISCAIS, type OperacaoFiscal } from './dominio';
import { ErroFiscal } from './erros';
import { regraFiscal } from './regras';

export { regraFiscal, type RegraFiscal } from './regras';

/** Contrato §5.7. */
export type ConfiguracaoFiscal = { emitente: DadosEmitente; regime: RegimeTributario; serie: string | null; ambiente: AmbienteNfe };
export type DadosEmpresa = DadosEmitente & { regime: RegimeTributario; serie: string };
export const CAMPOS_EMPRESA = ['razao_social', 'cnpj', 'ie', 'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'regime', 'serie'] as const;
export type EntradaEmpresa = Record<(typeof CAMPOS_EMPRESA)[number], string>;
export type SituacaoEmissor = { simulado: boolean; tokenHomologacao: boolean; tokenProducao: boolean };
type Configuracao = Awaited<ReturnType<typeof lerConfiguracao>>;

/** Limite dos campos de texto do emitente na NF-e. */
const TEXTO_MAXIMO = 60;
/** Séries 890 a 999 são reservadas (avulsa e contingência). */
const SERIE_MAXIMA = 889;

function ehRegime(texto: string): texto is RegimeTributario {
  return (REGIMES_TRIBUTARIOS as readonly string[]).includes(texto);
}
function ehAmbiente(texto: string): texto is AmbienteNfe {
  return (AMBIENTES_NFE as readonly string[]).includes(texto);
}
function exigirGestor(usuario: UsuarioSessao): void {
  if (!pode(usuario.perfil, 'administrar')) throw new ErroFiscal('Só o Gestor altera as configurações fiscais.');
}

/** Formulário "Dados da empresa" (spec §6.8): o emitente da NF-e, o regime tributário e a série exclusiva (spec §8.1). */
export function validarDadosEmpresa(e: EntradaEmpresa): { dados: DadosEmpresa | null; erros: string[] } {
  const erros: string[] = [];
  function texto(valor: string, nome: string, faltando: string | null): string | null {
    const s = valor.trim().replace(/\s+/g, ' ');
    if (!s) {
      if (faltando) erros.push(faltando);
      return null;
    }
    if (s.length > TEXTO_MAXIMO) {
      erros.push(`${nome}: no máximo ${TEXTO_MAXIMO} caracteres`);
      return null;
    }
    return s;
  }
  const razaoSocial = texto(e.razao_social, 'Razão social', 'Informe a razão social');
  const cnpjTexto = e.cnpj.trim();
  const cnpj = cnpjTexto ? normalizarCnpj(cnpjTexto) : null;
  if (!cnpjTexto) erros.push('Informe o CNPJ');
  else if (!cnpj) erros.push('CNPJ inválido');
  const ie = e.ie.toUpperCase().replace(/[.\-/\s]/g, '');
  if (!ie) erros.push('Informe a inscrição estadual');
  else if (!/^\d{2,14}$/.test(ie)) erros.push('Inscrição estadual inválida: use só os números');
  const cepTexto = e.cep.trim();
  const cep = cepTexto ? normalizarCep(cepTexto) : null;
  if (!cepTexto) erros.push('Informe o CEP');
  else if (!cep) erros.push('CEP inválido');
  const logradouro = texto(e.logradouro, 'Logradouro', 'Informe o logradouro');
  const numero = texto(e.numero, 'Número', 'Informe o número (ou S/N)');
  const complemento = texto(e.complemento, 'Complemento', null);
  const bairro = texto(e.bairro, 'Bairro', 'Informe o bairro');
  const cidade = texto(e.cidade, 'Cidade', 'Informe a cidade');
  const uf = normalizarUf(e.uf);
  if (!uf) erros.push('Escolha a UF');
  const regime = e.regime.trim();
  if (!ehRegime(regime)) erros.push('Escolha o regime tributário');
  const serie = e.serie.trim();
  if (!/^\d{1,3}$/.test(serie) || Number(serie) > SERIE_MAXIMA) erros.push(`Série da NF-e inválida: use um número de 0 a ${SERIE_MAXIMA}`);
  if (erros.length > 0 || !razaoSocial || !cnpj || !cep || !logradouro || !numero || !bairro || !cidade || !uf || !ehRegime(regime)) {
    return { dados: null, erros };
  }
  return {
    dados: { razaoSocial, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, regime, serie: String(Number(serie)) },
    erros: [],
  };
}

/** Valores atuais para o formulário (texto vazio onde ainda não há dado). */
export function entradaDaConfiguracao(c: Configuracao): EntradaEmpresa {
  return {
    razao_social: c.razaoSocial ?? '',
    cnpj: c.cnpj ?? '',
    ie: c.ie ?? '',
    cep: c.cep ?? '',
    logradouro: c.logradouro ?? '',
    numero: c.numero ?? '',
    complemento: c.complemento ?? '',
    bairro: c.bairro ?? '',
    cidade: c.cidade ?? '',
    uf: c.uf ?? '',
    regime: c.regimeTributario ?? '',
    serie: c.serieNfe ?? '',
  };
}

/** Grava só os campos fiscais da linha única (contrato §5.6: upsert em id = 1). */
export async function salvarDadosEmpresa(db: DbOuTx, d: DadosEmpresa, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirGestor(usuario);
  const campos = {
    razaoSocial: d.razaoSocial,
    cnpj: d.cnpj,
    ie: d.ie,
    logradouro: d.logradouro,
    numero: d.numero,
    complemento: d.complemento,
    bairro: d.bairro,
    cidade: d.cidade,
    uf: d.uf,
    cep: d.cep,
    regimeTributario: d.regime,
    serieNfe: d.serie,
    atualizadoPor: usuario.id,
    atualizadoEm: agora,
  };
  await db.transaction(async (tx) => {
    await tx.insert(configuracoes).values({ id: 1, ...campos }).onConflictDoUpdate({ target: configuracoes.id, set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'fiscal',
      acao: 'configuracao_alterada',
      usuarioId: usuario.id,
      dados: { secao: 'empresa', regime: d.regime, serie: d.serie },
    });
  });
}

/** Tela de Configurações: diz se os tokens estão no .env, sem nunca mostrar o valor. */
export function situacaoDoEmissor(env: Env = lerEnv()): SituacaoEmissor {
  return {
    simulado: env.EMISSOR_NFE === 'falso',
    tokenHomologacao: Boolean(env.FOCUS_TOKEN_HOMOLOGACAO),
    tokenProducao: Boolean(env.FOCUS_TOKEN_PRODUCAO),
  };
}

/** Spec §8.1: começa em homologação; produção só depois da validação do contador. */
export function validarTrocaAmbiente(p: { ambiente: string; confirmado: boolean; emissor: SituacaoEmissor }): {
  ambiente: AmbienteNfe | null;
  erros: string[];
} {
  if (!ehAmbiente(p.ambiente)) return { ambiente: null, erros: ['Escolha o ambiente da NF-e'] };
  const erros: string[] = [];
  if (p.ambiente === 'PRODUCAO') {
    if (!p.confirmado) erros.push('Para passar para produção, confirme que o contador validou as regras e as notas de homologação.');
    if (!p.emissor.simulado && !p.emissor.tokenProducao) erros.push('Falta o token de produção da Focus NFe (FOCUS_TOKEN_PRODUCAO) no .env do servidor.');
  }
  return erros.length > 0 ? { ambiente: null, erros } : { ambiente: p.ambiente, erros: [] };
}

export async function salvarAmbiente(db: DbOuTx, ambiente: AmbienteNfe, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  exigirGestor(usuario);
  const anterior = (await lerConfiguracao(db)).ambienteNfe;
  const campos = { ambienteNfe: ambiente, atualizadoPor: usuario.id, atualizadoEm: agora };
  await db.transaction(async (tx) => {
    await tx.insert(configuracoes).values({ id: 1, ...campos }).onConflictDoUpdate({ target: configuracoes.id, set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: 'fiscal',
      acao: 'configuracao_alterada',
      de: anterior,
      para: ambiente,
      usuarioId: usuario.id,
      dados: { secao: 'ambiente_nfe' },
    });
  });
}

/** Contrato §5.7: ErroFiscal se faltar dado da empresa ou o regime. */
export async function lerConfiguracaoFiscal(db: DbOuTx): Promise<ConfiguracaoFiscal> {
  const c = await lerConfiguracao(db);
  const faltando: string[] = [];
  const exigir = (valor: string | null | undefined, nome: string): string => {
    if (!valor) faltando.push(nome);
    return valor ?? '';
  };
  const emitente: DadosEmitente = {
    razaoSocial: exigir(c.razaoSocial, 'razão social'),
    cnpj: exigir(c.cnpj, 'CNPJ'),
    ie: exigir(c.ie, 'inscrição estadual'),
    logradouro: exigir(c.logradouro, 'logradouro'),
    numero: exigir(c.numero, 'número'),
    complemento: c.complemento ?? null,
    bairro: exigir(c.bairro, 'bairro'),
    cidade: exigir(c.cidade, 'cidade'),
    uf: exigir(c.uf, 'UF'),
    cep: exigir(c.cep, 'CEP'),
  };
  if (faltando.length > 0) throw new ErroFiscal(`Preencha os dados da empresa em Configurações › Fiscal (falta: ${faltando.join(', ')}).`);
  if (!c.regimeTributario) throw new ErroFiscal('Escolha o regime tributário em Configurações › Fiscal.');
  return { emitente, regime: c.regimeTributario, serie: c.serieNfe ?? null, ambiente: c.ambienteNfe };
}

/** Spec §8.4: a operação vem da comparação entre a UF da empresa e a UF do destinatário. */
export function operacaoPorUf(ufEmpresa: string, ufDestinatario: string): OperacaoFiscal {
  return ufEmpresa.trim().toUpperCase() === ufDestinatario.trim().toUpperCase() ? 'DENTRO_ESTADO' : 'FORA_ESTADO';
}

/** O que impede a NF de devolução agora (D13): dados da empresa, regime e as 2 regras de devolução. Vazio = pode emitir. */
export async function pendenciasFiscais(db: DbOuTx): Promise<string[]> {
  const pendencias: string[] = [];
  const anotar = (erro: unknown): void => {
    if (!(erro instanceof ErroFiscal)) throw erro;
    if (!pendencias.includes(erro.message)) pendencias.push(erro.message);
  };
  await lerConfiguracaoFiscal(db).catch(anotar);
  for (const operacao of OPERACOES_FISCAIS) {
    await regraFiscal(db, 'DEVOLUCAO_VENDA', operacao).catch(anotar);
  }
  return pendencias;
}
