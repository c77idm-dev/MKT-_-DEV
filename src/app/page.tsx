import { redirect } from 'next/navigation';
import { paginaInicial } from '@/modules/auth/permissoes';
import { usuarioAtual } from '@/modules/auth/servidor';

/** (E29) O endereço raiz leva à página inicial do perfil: o Operador, à Bancada; quem acompanha, ao Fluxo. */
export default async function Inicio() {
  const usuario = await usuarioAtual();
  redirect(usuario ? paginaInicial(usuario.perfil) : '/login');
}
