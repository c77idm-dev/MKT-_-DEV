import { PERFIS, ROTULO_PERFIL } from '@/modules/auth/perfis';

/** Opções do `<select>` de perfil (rótulos de ROTULO_PERFIL), usadas no cadastro e na troca de perfil. */
export function OpcoesPerfil() {
  return PERFIS.map((p) => (
    <option key={p} value={p}>
      {ROTULO_PERFIL[p]}
    </option>
  ));
}
