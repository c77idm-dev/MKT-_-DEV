import type { Metadata } from 'next';
import Link from 'next/link';
import { ALERTA_ATENCAO, CARTAO, LINK_VOLTAR } from '@/components/estilos';
import { obterDb } from '@/db';
import { lerEnv } from '@/lib/env';
import { exigirPermissao } from '@/modules/auth/servidor';
import { lerConfiguracao } from '@/modules/configuracoes/ler';
import { salvarConfiguracaoMidiaAcao } from './acoes';
import { FormularioConferenciaMidias } from './FormularioConferenciaMidias';

export const metadata: Metadata = { title: 'Conferência e mídias · Gestão de Devoluções' };

/** Spec §6.8: obrigatoriedade do vídeo, prazo de guarda das mídias e armazenamento (este vem do .env, contrato D2). */
export default async function PaginaConferenciaMidias() {
  await exigirPermissao('administrar');
  const config = await lerConfiguracao(obterDb());
  const env = lerEnv();
  const noDisco = env.ARMAZENAMENTO === 'disco';
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <Link href="/configuracoes" className={`${LINK_VOLTAR} self-start`}>
        ← Configurações
      </Link>
      <h1 className="text-xl font-bold">Conferência e mídias</h1>
      <FormularioConferenciaMidias
        acao={salvarConfiguracaoMidiaAcao}
        videoObrigatorio={config.videoObrigatorio}
        mesesRetencaoMidia={config.mesesRetencaoMidia}
      />
      <section aria-labelledby="titulo-armazenamento" className={`${CARTAO} flex flex-col gap-2`}>
        <h2 id="titulo-armazenamento" className="text-base font-bold">
          Armazenamento
        </h2>
        <p className="text-[15px]">{noDisco ? 'Disco do servidor' : 'S3 (Backblaze B2 ou Cloudflare R2)'}</p>
        <p className="text-xs text-texto-2">Definido no arquivo de configuração do servidor (ARMAZENAMENTO), junto com as credenciais.</p>
        {noDisco && env.NODE_ENV === 'production' && (
          <p className={ALERTA_ATENCAO}>As mídias estão no disco do servidor: use só para teste. Ligue o B2 antes do uso diário.</p>
        )}
      </section>
    </div>
  );
}
