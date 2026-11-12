import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { exigirPermissao } from '@/modules/auth/servidor';
import { obterDefinicao } from '@/modules/importacao/definicoes';
import { enviarPlanilhaAcao } from './acoes';
import { FormularioUpload } from './FormularioUpload';

export const metadata: Metadata = { title: 'Importar planilha · Gestão de Devoluções' };

export default async function PaginaImportar({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const def = obterDefinicao(tipo);
  if (!def) notFound();
  await exigirPermissao(def.acao);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <Link href={def.voltarPara} className={LINK_VOLTAR}>
        ← {def.titulo}
      </Link>
      <h1 className="text-xl font-bold">Importar planilha: {def.titulo}</h1>
      <div className={`${CARTAO} flex flex-col gap-2 text-sm`}>
        <p>
          Envie um arquivo .csv ou .xlsx de até 5 MB. A primeira linha precisa ter os nomes das colunas. No próximo passo você
          diz qual coluna é cada campo; a planilha pode estar do jeito que ela já é.
        </p>
        <p className="text-texto-2">
          Modelo sugerido: <span className="font-mono [overflow-wrap:anywhere]">{def.campos.map((c) => c.chave).join(', ')}</span>
        </p>
      </div>
      <FormularioUpload acao={enviarPlanilhaAcao.bind(null, def.tipo)} />
    </div>
  );
}
