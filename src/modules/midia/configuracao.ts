import type { Db } from '@/db/client';
import { configuracoes } from '@/db/schema';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import { VIDEO_OBRIGATORIO, type VideoObrigatorio } from '@/modules/configuracoes/dominio';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { registrarEvento } from '@/modules/historico/eventos';

export type DadosConfiguracaoMidia = { videoObrigatorio: VideoObrigatorio; mesesRetencaoMidia: number };

export class ErroConfiguracao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroConfiguracao';
  }
}

export function validarConfiguracaoMidia(e: { videoObrigatorio: string; mesesRetencaoMidia: string }): {
  dados: DadosConfiguracaoMidia | null;
  erros: string[];
} {
  const erros: string[] = [];
  const video = (VIDEO_OBRIGATORIO as readonly string[]).includes(e.videoObrigatorio) ? (e.videoObrigatorio as VideoObrigatorio) : null;
  if (!video) erros.push('Escolha quando o Vídeo de Prova é obrigatório.');
  const texto = e.mesesRetencaoMidia.trim();
  const meses = /^\d{1,3}$/.test(texto) ? Number(texto) : Number.NaN;
  if (!(meses >= 1 && meses <= 120)) erros.push('Prazo de guarda: de 1 a 120 meses.');
  if (erros.length > 0 || !video) return { dados: null, erros };
  return { dados: { videoObrigatorio: video, mesesRetencaoMidia: meses }, erros: [] };
}

/** Upsert na linha 1 só dos campos da Fase 2 (contrato §5.6). A Fase 6 lê o prazo de guarda na tarefa midia.retencao. */
export async function salvarConfiguracaoMidia(db: Db, dados: DadosConfiguracaoMidia, usuario: UsuarioSessao, agora: Date = new Date()): Promise<void> {
  if (usuario.perfil !== 'GESTOR') throw new ErroConfiguracao('Só o Gestor muda as Configurações.');
  await db.transaction(async (tx) => {
    const antes = await lerConfiguracao(tx);
    const campos = { videoObrigatorio: dados.videoObrigatorio, mesesRetencaoMidia: dados.mesesRetencaoMidia, atualizadoPor: usuario.id, atualizadoEm: agora };
    await tx.insert(configuracoes).values({ id: 1, ...campos }).onConflictDoUpdate({ target: configuracoes.id, set: campos });
    await registrarEvento(tx, {
      entidade: 'configuracao',
      entidadeId: '1',
      acao: 'configuracao_alterada',
      usuarioId: usuario.id,
      em: agora,
      dados: {
        area: 'conferencia_midias',
        antes: { videoObrigatorio: antes.videoObrigatorio, mesesRetencaoMidia: antes.mesesRetencaoMidia },
        depois: { videoObrigatorio: dados.videoObrigatorio, mesesRetencaoMidia: dados.mesesRetencaoMidia },
      },
    });
  });
}
