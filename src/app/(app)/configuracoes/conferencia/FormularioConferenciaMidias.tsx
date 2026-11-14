'use client';

import { ListaErros } from '@/components/ListaErros';
import { MensagemSucesso } from '@/components/MensagemSucesso';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { ROTULO_VIDEO_OBRIGATORIO, VIDEO_OBRIGATORIO, type VideoObrigatorio } from '@/modules/configuracoes/dominio';
import type { EstadoConfiguracaoMidia } from './acoes';

type Props = {
  acao: (anterior: EstadoConfiguracaoMidia, dados: FormData) => Promise<EstadoConfiguracaoMidia>;
  videoObrigatorio: VideoObrigatorio;
  mesesRetencaoMidia: number;
};

export function FormularioConferenciaMidias({ acao, videoObrigatorio, mesesRetencaoMidia }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [], salvoEm: null });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      {estado.salvoEm && <MensagemSucesso key={estado.salvoEm} texto="Configuração salva." />}
      <ListaErros erros={estado.erros} />
      <fieldset className="flex flex-col gap-1">
        <legend className={`${ROTULO} mb-1`}>Vídeo de Prova obrigatório</legend>
        {VIDEO_OBRIGATORIO.map((v) => (
          <label key={v} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="videoObrigatorio" value={v} defaultChecked={v === videoObrigatorio} className="size-5 shrink-0" />
            {ROTULO_VIDEO_OBRIGATORIO[v]}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mesesRetencaoMidia" className={ROTULO}>
          Prazo de guarda das mídias (meses)
        </label>
        <input
          id="mesesRetencaoMidia"
          name="mesesRetencaoMidia"
          defaultValue={String(mesesRetencaoMidia)}
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="mesesRetencaoMidia-dica"
          className={CAMPO}
        />
        <p id="mesesRetencaoMidia-dica" className="text-xs text-texto-2">
          As fotos e os vídeos de devoluções concluídas há mais tempo são apagados (nunca os de lote em aberto ou contestação sem resposta).
        </p>
      </div>
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
