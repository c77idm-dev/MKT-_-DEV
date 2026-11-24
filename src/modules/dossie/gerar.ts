import type { DbOuTx } from '@/db/client';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { registrarEvento } from '@/modules/historico/eventos';
import { carregarDossie } from './carregar';
import { ACAO_DOSSIE_GERADO, nomeArquivoDossie } from './dominio';
import { midiasDoArmazenamento } from './midias';
import { gerarPdfDossie, type MidiasDossie, type ResultadoPdf } from './pdf';
import { criarJuncao, criarSerie } from './serie';

export type ResultadoDossie =
  | { tipo: 'nao_encontrada' }
  | { tipo: 'conferencia_pendente' }
  | { tipo: 'ok'; pdf: ResultadoPdf; nomeArquivo: string };

/** Teto de cada dossiê, abaixo dos 120 s que o nginx espera nesta rota (docker/nginx/devolucoes.conf). */
const PRAZO_DOSSIE_MS = 100_000;

/** Um dossiê por vez neste processo, no máximo um esperando, cada um com prazo (serie.ts). */
const emSerie = criarSerie({ maxPendentes: 2, prazoMs: PRAZO_DOSSIE_MS });
/** Toques repetidos da mesma pessoa na mesma devolução (e o 2º toque depois de um 504) usam a geração em andamento. */
const juntar = criarJuncao();

/**
 * Dossiê de provas (extra): carrega, monta o PDF (só depois da conferência) e registra "dossiê gerado" no histórico,
 * com quem e quando. O evento guarda só números (páginas, tamanho, imagens): nada de chave de mídia.
 * `sinal`: o pedido (request.signal). Se todos os que esperam por esta geração forem embora, ela para entre uma foto
 * e outra e nada é registrado. Fila cheia: ErroFilaCheia; prazo estourado: ErroPrazoEsgotado (serie.ts).
 */
export async function gerarDossie(
  db: DbOuTx,
  codigo: string,
  usuario: UsuarioSessao,
  o: { agora?: Date; midias?: MidiasDossie; limiteBytes?: number; sinal?: AbortSignal } = {},
): Promise<ResultadoDossie> {
  o.sinal?.throwIfAborted();
  const agora = o.agora ?? new Date();
  const dados = await carregarDossie(db, codigo, { em: agora });
  if (!dados) return { tipo: 'nao_encontrada' };
  if (!dados.conferidaEm) return { tipo: 'conferencia_pendente' };
  const pdf = await juntar(`${dados.codigo}:${usuario.id}`, o.sinal, (sinalDosPedidos) =>
    emSerie(
      async (sinal) => {
        const pdf = await gerarPdfDossie(dados, o.midias ?? midiasDoArmazenamento(), { limiteBytes: o.limiteBytes, sinal });
        // Quem pediu foi embora (ou passou do prazo) enquanto o PDF ficava pronto: nada de "dossiê gerado".
        sinal.throwIfAborted();
        await registrarEvento(db, {
          entidade: 'devolucao',
          entidadeId: dados.id,
          acao: ACAO_DOSSIE_GERADO,
          usuarioId: usuario.id,
          em: agora,
          dados: { paginas: pdf.paginas, tamanho: pdf.tamanho, ladoMaior: pdf.opcoes.ladoMaior, qualidade: pdf.opcoes.qualidade },
        });
        return pdf;
      },
      { sinal: sinalDosPedidos },
    ),
  );
  return { tipo: 'ok', pdf, nomeArquivo: nomeArquivoDossie(dados.codigo) };
}
