'use client';

import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { BotaoConfirmar } from '@/components/mercado-livre/BotaoConfirmar';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import { MOTIVOS_CANAL, MOTIVOS_COM_FOTO_OBRIGATORIA, ROTULO_MOTIVO_CANAL } from '@/modules/mercado-livre/dominio';
import type { EstadoEnvio } from './acoes';

type Foto = { id: string; rotulo: string; url: string | null; selecionada: boolean };
type Props = {
  acao: (anterior: EstadoEnvio, dados: FormData) => Promise<EstadoEnvio>;
  motivo: MotivoCanal;
  mensagem: string;
  /** Vem do servidor (LIMITE_MENSAGEM): este componente não importa módulos que tocam o banco. */
  limiteMensagem: number;
  fotos: Foto[];
};

/** O Gestor revisa o motivo, a mensagem e as fotos e envia ao ML (spec §6.6). Uma coluna; botão no rodapé fixo. */
export function FormularioContestacao({ acao, motivo, mensagem, limiteMensagem, fotos }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-revisao" className={`${CARTAO} flex flex-col gap-4`}>
      <h2 id="titulo-revisao" className="text-base font-bold">
        Revisar e enviar
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo" className={ROTULO}>
          Motivo para o Mercado Livre
        </label>
        <select id="motivo" name="motivo" defaultValue={motivo} className={CAMPO}>
          {MOTIVOS_CANAL.map((m) => (
            <option key={m} value={m}>
              {m} · {ROTULO_MOTIVO_CANAL[m]}
              {MOTIVOS_COM_FOTO_OBRIGATORIA.includes(m) ? ' (exige foto)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="mensagem" className={ROTULO}>
          Mensagem
        </label>
        <textarea
          id="mensagem"
          name="mensagem"
          defaultValue={mensagem}
          required
          minLength={10}
          maxLength={limiteMensagem}
          rows={7}
          className={`${CAMPO} h-auto min-h-40 py-2`}
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className={ROTULO}>Fotos que vão para o ML</legend>
        {fotos.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhuma foto desta devolução.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fotos.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-borda bg-superficie p-2 has-[:checked]:border-destaque">
                  {f.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- link temporário assinado (spec §9), sem otimização de imagem
                    <img src={f.url} alt="" className="aspect-square w-full rounded object-cover" />
                  ) : (
                    <span aria-hidden="true" className="flex aspect-square items-center justify-center rounded bg-fundo text-xs text-texto-2">
                      Sem prévia
                    </span>
                  )}
                  <span className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="foto" value={f.id} defaultChecked={f.selecionada} className="size-5 shrink-0" />
                    {f.rotulo}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <BotaoConfirmar rotulo="Enviar ao ML" rotuloConfirmar="Toque de novo para enviar ao ML" desabilitado={pendente} className={BOTAO_PRIMARIO} />
      </RodapeFormulario>
    </form>
  );
}
