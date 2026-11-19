'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logErroML } from '@/conectores/marketplace/mercadolivre/erros';
import { obterDb } from '@/db';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterFila } from '@/modules/fila/fila';
import { configML } from '@/modules/mercado-livre/config';
import { buscarEAtualizarContas, ErroContaBitbrain, marcarContaBitbrain, mensagemFalhaBitbrain } from '@/modules/mercado-livre/contas-bitbrain';
import { pedirSincronizacaoAgora } from '@/modules/mercado-livre/tarefas';
import type { EstadoContasBitbrain } from './tipos-bitbrain';

const esquema = z.discriminatedUnion('operacao', [
  z.object({ operacao: z.literal('atualizar') }),
  z.object({ operacao: z.literal('sincronizar') }),
  z.object({ operacao: z.literal('marcar'), empresa: z.string().trim().min(1).max(100), recebe: z.enum(['sim', 'nao']) }),
]);

/** "Atualizar contas", "Sincronizar agora" e marcar/desmarcar a conta (§4.3 e §4.4). Só o Gestor. */
export async function acaoContasBitbrain(_anterior: EstadoContasBitbrain, dados: FormData): Promise<EstadoContasBitbrain> {
  const usuario = await exigirPermissao('administrar');
  const config = configML();
  if (config.modo !== 'bitbrain') return { erros: ['Esta ação só vale com ML_CONECTOR=bitbrain.'], ok: null };
  const lido = esquema.safeParse(Object.fromEntries(dados));
  if (!lido.success) return { erros: ['Pedido inválido.'], ok: null };
  const db = obterDb();
  const agora = new Date();
  let ok: string;
  switch (lido.data.operacao) {
    case 'atualizar': {
      try {
        const r = await buscarEAtualizarContas(db, config, agora);
        ok = `Lista de contas atualizada: ${r.total} ${r.total === 1 ? 'conta' : 'contas'} no Bitbrain.`;
      } catch (erro) {
        logErroML('atualizar as contas do Bitbrain', erro);
        return { erros: [mensagemFalhaBitbrain(erro)], ok: null };
      }
      break;
    }
    case 'sincronizar':
      await pedirSincronizacaoAgora(obterFila());
      ok = 'Sincronização pedida. As devoluções novas aparecem em instantes.';
      break;
    case 'marcar':
      try {
        await marcarContaBitbrain(db, { empresa: lido.data.empresa, recebe: lido.data.recebe === 'sim' }, usuario, agora);
      } catch (erro) {
        if (erro instanceof ErroContaBitbrain) return { erros: [erro.message], ok: null };
        throw erro;
      }
      ok = lido.data.recebe === 'sim' ? 'A conta passa a mandar devoluções para a bancada.' : 'A conta não manda mais devoluções para a bancada.';
      break;
  }
  revalidatePath('/configuracoes/mercado-livre');
  return { erros: [], ok };
}
