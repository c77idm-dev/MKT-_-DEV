'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { CamposItens } from '@/components/CamposItens';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { SelectCanal } from '@/components/SelectCanal';
import { BOTAO_PRIMARIO, CARTAO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { criarDevolucaoAcao } from './acoes';

/** Campos da spec §6.1: canal, pedido, ID da reclamação, rastreio, transportadora e itens por SKU e quantidade. */
export function FormularioNovaDevolucao() {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(criarDevolucaoAcao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      <SelectCanal id="canal" />
      <CampoTexto nome="pedido" rotulo="Número do pedido (obrigatório)" obrigatorio mono maximo={60} />
      <CampoTexto nome="reclamacao" rotulo="ID da reclamação" mono maximo={60} />
      <CampoTexto nome="rastreio" rotulo="Código de rastreamento" mono maiusculas maximo={60} />
      <CampoTexto nome="transportadora" rotulo="Transportadora" maximo={60} />
      <CamposItens />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Cadastrando…' : 'Cadastrar devolução'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
