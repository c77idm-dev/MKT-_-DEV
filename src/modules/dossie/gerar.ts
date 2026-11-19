import type { DbOuTx } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { carregarDossie } from './carregar';
import { ACAO_DOSSIE_GERADO, nomeArquivoDossie } from './dominio';
import { midiasDoArmazenamento } from './midias';
import { gerarPdfDossie, type MidiasDossie, type ResultadoPdf } from './pdf';
import { criarSerie } from './serie';

export type ResultadoDossie =
  | { tipo: 'nao_encontrada' }
  | { tipo: 'conferencia_pendente' }
  | { tipo: 'ok'; pdf: ResultadoPdf; nomeArquivo: string };

/** Um dossiê por vez neste processo (serie.ts). */
const emSerie = criarSerie();

/**
 * Dossiê de provas (extra): carrega, monta o PDF (só depois da conferência) e registra "dossiê gerado" no histórico,
 * com quem e quando. O evento guarda só números (páginas, tamanho, imagens): nada de chave de mídia.
 */
export async function gerarDossie(
  db: DbOuTx,
  codigo: string,
  usuario: UsuarioSessao,
  o: { agora?: Date; midias?: MidiasDossie; limiteBytes?: number } = {},
): Promise<ResultadoDossie> {
  const agora = o.agora ?? new Date();
  const dados = await carregarDossie(db, codigo, { em: agora, porNome: usuario.nome });
  if (!dados) return { tipo: 'nao_encontrada' };
  if (!dados.conferidaEm) return { tipo: 'conferencia_pendente' };
  const pdf = await emSerie(() => gerarPdfDossie(dados, o.midias ?? midiasDoArmazenamento(), { limiteBytes: o.limiteBytes }));
  await registrarEvento(db, {
    entidade: 'devolucao',
    entidadeId: dados.id,
    acao: ACAO_DOSSIE_GERADO,
    usuarioId: usuario.id,
    em: agora,
    dados: { paginas: pdf.paginas, tamanho: pdf.tamanho, ladoMaior: pdf.opcoes.ladoMaior, qualidade: pdf.opcoes.qualidade },
  });
  return { tipo: 'ok', pdf, nomeArquivo: nomeArquivoDossie(dados.codigo) };
}
