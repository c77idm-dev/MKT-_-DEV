'use client';

import { CampoTexto } from '@/components/CampoTexto';
import { ListaErros } from '@/components/ListaErros';
import { RodapeFormulario } from '@/components/RodapeFormulario';
import { BOTAO_PRIMARIO, CAMPO, ROTULO } from '@/components/estilos';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import { UFS } from '@/modules/catalogo/documentos';
import { REGIMES_TRIBUTARIOS } from '@/modules/configuracoes/dominio';
import type { EntradaEmpresa } from '@/modules/fiscal/configuracao';
import { ROTULO_REGIME } from '@/modules/fiscal/dominio';
import type { EstadoFormulario } from './acoes';

type Props = { acao: (anterior: EstadoFormulario, dados: FormData) => Promise<EstadoFormulario>; valores: EntradaEmpresa };

/** Spec §6.8 e §8.1: o emitente da NF-e, o regime tributário e a série exclusiva do sistema. */
export function FormularioEmpresa({ acao, valores }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] });
  return (
    <form onSubmit={aoEnviar} aria-label="Dados da empresa" className="flex flex-col gap-4">
      <p className="text-sm text-texto-2">Todos os campos são obrigatórios, menos o complemento. Eles saem como emitente da NF-e.</p>
      <CampoTexto nome="razao_social" rotulo="Razão social" valorInicial={valores.razao_social} obrigatorio maximo={60} autoComplete="organization" />
      <CampoTexto nome="cnpj" rotulo="CNPJ" valorInicial={valores.cnpj} obrigatorio mono maiusculas maximo={18} />
      <CampoTexto nome="ie" rotulo="Inscrição estadual" valorInicial={valores.ie} obrigatorio mono modoTeclado="numeric" maximo={20} />
      <CampoTexto nome="cep" rotulo="CEP" valorInicial={valores.cep} obrigatorio mono modoTeclado="numeric" maximo={9} />
      <CampoTexto nome="logradouro" rotulo="Logradouro" valorInicial={valores.logradouro} obrigatorio maximo={60} />
      <div className="grid grid-cols-2 gap-3">
        <CampoTexto nome="numero" rotulo="Número" valorInicial={valores.numero} obrigatorio maximo={60} />
        <CampoTexto nome="complemento" rotulo="Complemento (opcional)" valorInicial={valores.complemento} maximo={60} />
      </div>
      <CampoTexto nome="bairro" rotulo="Bairro" valorInicial={valores.bairro} obrigatorio maximo={60} />
      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <CampoTexto nome="cidade" rotulo="Cidade" valorInicial={valores.cidade} obrigatorio maximo={60} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="uf" className={ROTULO}>
            UF
          </label>
          <select id="uf" name="uf" required defaultValue={valores.uf} className={CAMPO}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
      </div>
      <fieldset className="flex flex-col">
        <legend className={ROTULO}>Regime tributário</legend>
        {REGIMES_TRIBUTARIOS.map((regime) => (
          <label key={regime} className="flex min-h-11 items-center gap-3 text-[15px]">
            <input type="radio" name="regime" value={regime} defaultChecked={valores.regime === regime} className="size-5" />
            {ROTULO_REGIME[regime]}
          </label>
        ))}
      </fieldset>
      <CampoTexto
        nome="serie"
        rotulo="Série da NF-e"
        valorInicial={valores.serie}
        obrigatorio
        mono
        modoTeclado="numeric"
        maximo={3}
        dica="Série exclusiva do sistema (ex.: 2), a mesma do cadastro da empresa na Focus NFe. Não use a série do Bitbrain."
      />
      <ListaErros erros={estado.erros} />
      <RodapeFormulario>
        <button type="submit" disabled={pendente} className={BOTAO_PRIMARIO}>
          {pendente ? 'Salvando…' : 'Salvar dados da empresa'}
        </button>
      </RodapeFormulario>
    </form>
  );
}
