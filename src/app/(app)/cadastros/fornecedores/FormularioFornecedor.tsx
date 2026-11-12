'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, CARTAO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { UFS } from '@/modules/catalogo/documentos';
import type { EstadoFormulario } from './acoes';

export type ValoresFornecedor = Record<
  'razao_social' | 'cnpj' | 'ie' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cep' | 'contato_sac' | 'email_sac',
  string
>;

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; valores: ValoresFornecedor };

export function FormularioFornecedor({ acao, valores }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} className={`${CARTAO} flex flex-col gap-4`}>
      <CampoTexto nome="razao_social" rotulo="Razão social (obrigatório)" valorInicial={valores.razao_social} obrigatorio maximo={200} />
      <CampoTexto nome="cnpj" rotulo="CNPJ (obrigatório)" valorInicial={valores.cnpj} obrigatorio mono maiusculas maximo={18} dica="Aceita o CNPJ novo com letras." />
      <CampoTexto nome="ie" rotulo="Inscrição estadual" valorInicial={valores.ie} mono maiusculas maximo={20} />
      <CampoTexto nome="logradouro" rotulo="Logradouro" valorInicial={valores.logradouro} maximo={200} />
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto nome="numero" rotulo="Número" valorInicial={valores.numero} maximo={20} />
        <CampoTexto nome="complemento" rotulo="Complemento" valorInicial={valores.complemento} maximo={100} />
      </div>
      <CampoTexto nome="bairro" rotulo="Bairro" valorInicial={valores.bairro} maximo={100} />
      <CampoTexto nome="cidade" rotulo="Cidade" valorInicial={valores.cidade} maximo={100} />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="uf" className={ROTULO}>
            UF
          </label>
          <select id="uf" name="uf" defaultValue={valores.uf} className={CAMPO}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <CampoTexto nome="cep" rotulo="CEP" valorInicial={valores.cep} mono modoTeclado="numeric" maximo={9} />
      </div>
      <CampoTexto nome="contato_sac" rotulo="Contato do SAC" valorInicial={valores.contato_sac} maximo={100} />
      <CampoTexto nome="email_sac" rotulo="E-mail do SAC" valorInicial={valores.email_sac} tipo="email" modoTeclado="email" maximo={200} />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
