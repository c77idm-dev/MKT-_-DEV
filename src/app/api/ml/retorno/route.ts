import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { obterDb } from '@/db';
import { pode } from '@/modules/auth/permissoes';
import { usuarioAtual } from '@/modules/auth/servidor';
import { obterFila } from '@/modules/fila/fila';
import { configML } from '@/modules/mercado-livre/config';
import { concluirConexaoML } from '@/modules/mercado-livre/conexao';
import { fetchDoML } from '@/modules/mercado-livre/fabrica-conector';
import { CAMINHO_RETORNO_ML, COOKIE_OAUTH_ML } from '@/modules/mercado-livre/oauth-estado';

export const dynamic = 'force-dynamic';

const PAGINA = '/configuracoes/mercado-livre';

/** Retorno do OAuth do ML (ML_REDIRECT_URI aponta para cá). Só o Gestor que pediu a conexão conclui (spec §6.9). */
export async function GET(requisicao: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) redirect('/login');
  if (!pode(usuario.perfil, 'administrar')) return new Response(null, { status: 404 });
  const loja = await cookies();
  const cookie = loja.get(COOKIE_OAUTH_ML)?.value;
  // O cookie vale para uma tentativa só.
  loja.set(COOKIE_OAUTH_ML, '', { path: CAMINHO_RETORNO_ML, maxAge: 0 });
  const config = configML();
  const resultado = await concluirConexaoML(obterDb(), obterFila(), {
    cookie,
    parametros: new URL(requisicao.url).searchParams,
    usuario,
    config,
    fetchFn: fetchDoML(config),
    agora: new Date(),
  });
  redirect(resultado === 'conectada' ? `${PAGINA}?ok=conectada` : `${PAGINA}?erro=${resultado}`);
}
