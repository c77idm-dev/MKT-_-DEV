'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { CamposItens } from '@/components/CamposItens';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { SelectCanal } from '@/components/SelectCanal';
import { BOTAO_PRIMARIO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoAcaoGestor } from './acoes';

type Acao = (anterior: EstadoAcaoGestor, dados: FormData) => Promise<EstadoAcaoGestor>;

/** Spec §5.2: Pendente de chegada → Cancelada ou Extraviada, por ação manual do Gestor. */
export function FormularioEncerrar({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-encerrar" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-encerrar" className="text-base font-bold">
        Encerrar sem chegada
      </h2>
      <fieldset className="flex flex-col">
        <legend className={ROTULO}>Novo status</legend>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="radio" name="para" value="CANCELADA" defaultChecked className="size-5" />
          Cancelada
        </label>
        <label className="flex min-h-11 items-center gap-3 text-[15px]">
          <input type="radio" name="para" value="EXTRAVIADA" className="size-5" />
          Extraviada
        </label>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="motivo" className={ROTULO}>
          Motivo
        </label>
        <textarea
          id="motivo"
          name="motivo"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-[15px]"
        />
      </div>
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Registrando…' : 'Registrar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}

/** Spec §5.2: o Gestor liga o pacote não identificado ao pedido certo e a marca sai. */
export function FormularioIdentificar({ acao }: { acao: Acao }) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} aria-labelledby="titulo-identificar" className={`${CARTAO} flex flex-col gap-3`}>
      <h2 id="titulo-identificar" className="text-base font-bold">
        Identificar devolução
      </h2>
      <p className="text-sm text-texto-2">Ligue este pacote ao pedido certo. A marca &quot;Não identificada&quot; sai.</p>
      <SelectCanal id="identificar-canal" />
      <CampoTexto nome="pedido" id="identificar-pedido" rotulo="Número do pedido (obrigatório)" obrigatorio mono maximo={60} />
      <CampoTexto nome="reclamacao" id="identificar-reclamacao" rotulo="ID da reclamação" mono maximo={60} />
      <CampoTexto nome="transportadora" id="identificar-transportadora" rotulo="Transportadora" maximo={60} />
      <CamposItens iniciais={[]} permitirVazio />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar identificação'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
