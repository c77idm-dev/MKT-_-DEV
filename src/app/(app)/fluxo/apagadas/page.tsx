import type { Metadata } from 'next';
import Link from 'next/link';
import { LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { formatarDataHora } from '@/lib/formatar';
import { listarApagadas } from '@/modules/apagadas/consultas';
import { PRAZO_APAGADAS_DIAS } from '@/modules/apagadas/dominio';
import { exigirPermissao } from '@/modules/auth/servidor';
import { restaurarAcao } from './acoes';
import { ListaApagadas, type ApagadaVista } from './ListaApagadas';

export const metadata: Metadata = { title: 'Apagadas · Gestão de Devoluções' };

/**
 * Lista "Apagadas" (extra, emenda E29), só do Gestor, pelo menu "O que você quer fazer?" ("Apagou algo por engano").
 * Apagar esconde, não exclui: daqui o Gestor restaura. A tarefa diária apaga de vez o que passou de 90 dias.
 */
export default async function PaginaApagadas() {
  await exigirPermissao('administrar');
  const agora = new Date();
  const itens: ApagadaVista[] = (await listarApagadas(obterDb(), agora)).map((i) => ({
    tipo: i.tipo,
    id: i.id,
    codigo: i.codigo,
    situacao: i.situacao,
    apagadaEmTexto: formatarDataHora(i.apagadaEm),
    apagadaPorNome: i.apagadaPorNome,
    diasParaSumir: i.diasParaSumir,
    href: i.tipo === 'devolucao' ? `/fluxo/devolucoes/${i.codigo}` : `/fluxo/retiradas-full/${i.codigo}`,
  }));
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <Link href="/fluxo" className={LINK_VOLTAR}>
        ← Fluxo
      </Link>
      <div>
        <h1 className="text-xl font-bold">Apagadas (extra)</h1>
        <p className="text-sm text-texto-2">
          Devoluções e retiradas do Full apagadas. Restaurar devolve cada uma exatamente para onde estava. Depois de {PRAZO_APAGADAS_DIAS} dias, somem de
          vez, com as fotos e os vídeos.
        </p>
      </div>
      <ListaApagadas itens={itens} restaurar={restaurarAcao} />
    </div>
  );
}
