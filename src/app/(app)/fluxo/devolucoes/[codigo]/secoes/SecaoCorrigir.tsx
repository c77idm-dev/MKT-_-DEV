import type { ReactNode } from 'react';
import { obterDb } from '@/db';
import { pode } from '@/modules/auth/permissoes';
import { obterDadosCorrecao } from '@/modules/devolucoes/correcoes-tela';
import { apagarAcao, corrigirDadosAcao, desfazerChegadaAcao, encerrarAcao, reabrirConferenciaAcao, trocarEstoqueAcao } from '../acoes';
import { PainelCorrigir } from '../CorrigirGestor';
import type { PropsSecao } from './tipos';

/**
 * Corrigir (Gestor) (extra, emenda E29): busca o que a seção precisa (a NF ativa e o lote de cada unidade) e liga as
 * ações à devolução. Só o Gestor; cada ação do servidor exige `administrar` de novo.
 */
export async function SecaoCorrigir({ devolucaoId, codigo, usuario }: PropsSecao): Promise<ReactNode> {
  if (!pode(usuario.perfil, 'administrar')) return null;
  const dados = await obterDadosCorrecao(obterDb(), devolucaoId);
  if (!dados) return null;
  return (
    <PainelCorrigir
      codigo={codigo}
      perfil={usuario.perfil}
      dados={dados}
      acoes={{
        trocarEstoque: trocarEstoqueAcao.bind(null, codigo),
        reabrir: reabrirConferenciaAcao.bind(null, devolucaoId, codigo),
        desfazer: desfazerChegadaAcao.bind(null, devolucaoId, codigo),
        corrigirDados: corrigirDadosAcao.bind(null, devolucaoId, codigo),
        apagar: apagarAcao.bind(null, devolucaoId, codigo),
        encerrar: encerrarAcao.bind(null, devolucaoId, codigo),
      }}
    />
  );
}
