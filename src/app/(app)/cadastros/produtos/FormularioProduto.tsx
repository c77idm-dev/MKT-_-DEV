'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { EstadoFormulario } from './acoes';

export type ValoresProduto = {
  sku: string;
  ean: string;
  descricao: string;
  cnpjFornecedor: string;
  ncm: string;
  custo: string;
  unidade: string;
};

type Props = {
  acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>;
  valores: ValoresProduto;
  fornecedores: { cnpj: string; razaoSocial: string }[];
};

export function FormularioProduto({ acao, valores, fornecedores }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      <CampoTexto nome="sku" rotulo="SKU (obrigatório)" valorInicial={valores.sku} obrigatorio mono maiusculas maximo={60} />
      <CampoTexto nome="descricao" rotulo="Descrição (obrigatório)" valorInicial={valores.descricao} obrigatorio maximo={200} />
      <CampoTexto nome="ean" rotulo="EAN (código de barras)" valorInicial={valores.ean} mono modoTeclado="numeric" maximo={20} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cnpj_fornecedor" className={ROTULO}>
          Fornecedor
        </label>
        <select id="cnpj_fornecedor" name="cnpj_fornecedor" defaultValue={valores.cnpjFornecedor} className={CAMPO}>
          <option value="">Sem fornecedor</option>
          {fornecedores.map((f) => (
            <option key={f.cnpj} value={f.cnpj}>
              {f.razaoSocial}
            </option>
          ))}
        </select>
      </div>
      <CampoTexto nome="ncm" rotulo="NCM" valorInicial={valores.ncm} mono modoTeclado="numeric" maximo={10} />
      <CampoTexto nome="custo" rotulo="Custo (R$)" valorInicial={valores.custo} modoTeclado="decimal" maximo={20} />
      <CampoTexto nome="unidade" rotulo="Unidade" valorInicial={valores.unidade} maiusculas maximo={6} />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
