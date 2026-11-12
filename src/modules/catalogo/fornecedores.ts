import { asc, count, eq, ilike, inArray, like, or } from 'drizzle-orm';
import type { DbOuTx } from '@/db/client';
import { ehViolacaoDeUnicidade } from '@/db/erros';
import { fornecedores } from '@/db/schema';
import { FOI_INSERIDO, manterSeVazio } from '@/db/sql';
import { escaparLike } from '@/lib/texto';
import { ehUuid } from '@/lib/uuid';
import { textoOpcional } from '@/lib/valores';
import { formatarCnpj, normalizarCep, normalizarCnpj, normalizarUf, somenteAlfanumericos } from './documentos';
import { ErroCadastro } from './erros';

export const POR_PAGINA_FORNECEDORES = 50;
const LOTE = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DadosFornecedor = {
  razaoSocial: string;
  cnpj: string;
  ie: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  contatoSac: string | null;
  emailSac: string | null;
};

export type FornecedorLista = {
  id: string;
  razaoSocial: string;
  cnpj: string;
  cidade: string | null;
  uf: string | null;
  emailSac: string | null;
};

/**
 * Valida uma linha de fornecedor com as chaves do modelo da spec §6.8
 * (razao_social, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, contato_sac, email_sac).
 * Serve para a planilha e para o formulário.
 */
export function interpretarLinhaFornecedor(v: Record<string, string>): { dados: DadosFornecedor | null; erros: string[] } {
  const erros: string[] = [];
  const razaoSocial = textoOpcional(v.razao_social, 200, 'Razão social', erros);
  if ((v.razao_social ?? '').trim() === '') erros.push('Informe a razão social');
  const cnpjTexto = (v.cnpj ?? '').trim();
  const cnpj = cnpjTexto ? normalizarCnpj(cnpjTexto) : null;
  if (!cnpjTexto) erros.push('Informe o CNPJ');
  else if (!cnpj) erros.push(`CNPJ inválido: ${cnpjTexto}`);
  const ie = textoOpcional(v.ie, 20, 'Inscrição estadual', erros)?.toUpperCase() ?? null;
  const logradouro = textoOpcional(v.logradouro, 200, 'Logradouro', erros);
  const numero = textoOpcional(v.numero, 20, 'Número', erros);
  const complemento = textoOpcional(v.complemento, 100, 'Complemento', erros);
  const bairro = textoOpcional(v.bairro, 100, 'Bairro', erros);
  const cidade = textoOpcional(v.cidade, 100, 'Cidade', erros);
  const ufTexto = (v.uf ?? '').trim();
  const uf = ufTexto ? normalizarUf(ufTexto) : null;
  if (ufTexto && !uf) erros.push(`UF inválida: ${ufTexto}`);
  const cepTexto = (v.cep ?? '').trim();
  const cep = cepTexto ? normalizarCep(cepTexto) : null;
  if (cepTexto && !cep) erros.push(`CEP inválido: ${cepTexto}`);
  const contatoSac = textoOpcional(v.contato_sac, 100, 'Contato do SAC', erros);
  const emailSac = (v.email_sac ?? '').trim().toLowerCase();
  if (emailSac && !EMAIL.test(emailSac)) erros.push(`E-mail do SAC inválido: ${emailSac}`);
  if (erros.length > 0 || !razaoSocial || !cnpj) return { dados: null, erros };
  return {
    dados: { razaoSocial, cnpj, ie, logradouro, numero, complemento, bairro, cidade, uf, cep, contatoSac, emailSac: emailSac || null },
    erros: [],
  };
}

export async function salvarFornecedor(db: DbOuTx, dados: DadosFornecedor, id?: string): Promise<string> {
  if (id !== undefined && !ehUuid(id)) throw new ErroCadastro('Fornecedor não encontrado');
  try {
    if (id) {
      const [atualizado] = await db
        .update(fornecedores)
        .set({ ...dados, atualizadoEm: new Date() })
        .where(eq(fornecedores.id, id))
        .returning({ id: fornecedores.id });
      if (!atualizado) throw new ErroCadastro('Fornecedor não encontrado');
      return atualizado.id;
    }
    const [criado] = await db.insert(fornecedores).values(dados).returning({ id: fornecedores.id });
    return criado.id;
  } catch (erro) {
    if (ehViolacaoDeUnicidade(erro)) throw new ErroCadastro(`Já existe um fornecedor com o CNPJ ${formatarCnpj(dados.cnpj)}`);
    throw erro;
  }
}

/** Importação: atualiza pelo CNPJ (spec §6.8). Célula vazia mantém o valor atual. */
export async function upsertFornecedores(db: DbOuTx, lista: DadosFornecedor[]): Promise<{ criados: number; atualizados: number }> {
  // Ordem fixa por CNPJ: duas importações simultâneas travam as linhas na mesma ordem, sem deadlock.
  const ordenada = [...lista].sort((a, b) => (a.cnpj < b.cnpj ? -1 : a.cnpj > b.cnpj ? 1 : 0));
  let criados = 0;
  let atualizados = 0;
  for (let i = 0; i < ordenada.length; i += LOTE) {
    const linhas = await db
      .insert(fornecedores)
      .values(ordenada.slice(i, i + LOTE))
      .onConflictDoUpdate({
        target: fornecedores.cnpj,
        set: {
          razaoSocial: manterSeVazio('fornecedores', 'razao_social'),
          ie: manterSeVazio('fornecedores', 'ie'),
          logradouro: manterSeVazio('fornecedores', 'logradouro'),
          numero: manterSeVazio('fornecedores', 'numero'),
          complemento: manterSeVazio('fornecedores', 'complemento'),
          bairro: manterSeVazio('fornecedores', 'bairro'),
          cidade: manterSeVazio('fornecedores', 'cidade'),
          uf: manterSeVazio('fornecedores', 'uf'),
          cep: manterSeVazio('fornecedores', 'cep'),
          contatoSac: manterSeVazio('fornecedores', 'contato_sac'),
          emailSac: manterSeVazio('fornecedores', 'email_sac'),
          atualizadoEm: new Date(),
        },
      })
      .returning({ inserido: FOI_INSERIDO });
    for (const l of linhas) {
      if (l.inserido) criados++;
      else atualizados++;
    }
  }
  return { criados, atualizados };
}

export async function listarFornecedores(
  db: DbOuTx,
  opcoes: { busca?: string; pagina?: number } = {},
): Promise<{ linhas: FornecedorLista[]; total: number }> {
  const busca = (opcoes.busca ?? '').trim();
  const documento = somenteAlfanumericos(busca);
  const onde = busca
    ? or(ilike(fornecedores.razaoSocial, `%${escaparLike(busca)}%`), documento ? like(fornecedores.cnpj, `%${documento}%`) : undefined)
    : undefined;
  const pagina = Math.max(1, opcoes.pagina ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(fornecedores).where(onde);
  const linhas = await db
    .select({
      id: fornecedores.id,
      razaoSocial: fornecedores.razaoSocial,
      cnpj: fornecedores.cnpj,
      cidade: fornecedores.cidade,
      uf: fornecedores.uf,
      emailSac: fornecedores.emailSac,
    })
    .from(fornecedores)
    .where(onde)
    .orderBy(asc(fornecedores.razaoSocial))
    .limit(POR_PAGINA_FORNECEDORES)
    .offset((pagina - 1) * POR_PAGINA_FORNECEDORES);
  return { linhas, total };
}

export async function obterFornecedor(db: DbOuTx, id: string): Promise<(DadosFornecedor & { id: string }) | null> {
  if (!ehUuid(id)) return null;
  const [f] = await db.select().from(fornecedores).where(eq(fornecedores.id, id));
  return f ?? null;
}

export async function opcoesFornecedores(db: DbOuTx): Promise<{ cnpj: string; razaoSocial: string }[]> {
  return db
    .select({ cnpj: fornecedores.cnpj, razaoSocial: fornecedores.razaoSocial })
    .from(fornecedores)
    .orderBy(asc(fornecedores.razaoSocial));
}

export async function idsDosFornecedores(db: DbOuTx, cnpjs: string[]): Promise<Map<string, string>> {
  if (cnpjs.length === 0) return new Map();
  const linhas = await db
    .select({ id: fornecedores.id, cnpj: fornecedores.cnpj })
    .from(fornecedores)
    .where(inArray(fornecedores.cnpj, cnpjs));
  return new Map(linhas.map((l) => [l.cnpj, l.id]));
}
