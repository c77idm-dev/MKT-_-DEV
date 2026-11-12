'use client';

import { createContext, startTransition, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { BOTAO_SECUNDARIO, CAMPO, ROTULO } from '@/components/estilos';
import type { Mapeamento } from '@/modules/importacao/tipos';

type Estado = { selecionado: Mapeamento; escolher: (chave: string, cabecalho: string) => void; sujo: boolean };
const Contexto = createContext<Estado | null>(null);

function useEstadoImportacao(): Estado {
  const estado = useContext(Contexto);
  if (!estado) throw new Error('Use dentro de ImportacaoInterativa');
  return estado;
}

/** Nulo, ausente e vazio contam como "não importar". */
export function mesmoMapeamento(a: Mapeamento, b: Mapeamento, chaves: readonly string[]): boolean {
  return chaves.every((chave) => (a[chave] ?? '') === (b[chave] ?? ''));
}

/**
 * Guarda o que está escolhido nos selects e o compara com o mapeamento que o SERVIDOR usou na prévia
 * (a propriedade `mapeamento`). Enquanto forem diferentes a prévia está desatualizada e a confirmação
 * fica desabilitada. Não depende de promessa nem de tempo: a propriedade nova chega no mesmo commit
 * dos campos escondidos da confirmação e da prévia nova. Se a ação falhar, a diferença continua e a
 * confirmação continua desabilitada.
 */
export function ImportacaoInterativa({
  chaves,
  mapeamento,
  children,
}: {
  chaves: string[];
  mapeamento: Mapeamento;
  children: ReactNode;
}) {
  const [selecionado, setSelecionado] = useState<Mapeamento>(mapeamento);
  const sujo = !mesmoMapeamento(selecionado, mapeamento, chaves);
  const escolher = (chave: string, cabecalho: string) => setSelecionado((atual) => ({ ...atual, [chave]: cabecalho }));
  return <Contexto.Provider value={{ selecionado, escolher, sujo }}>{children}</Contexto.Provider>;
}

export function useAtualizandoPrevia() {
  return useEstadoImportacao().sujo;
}

type CampoTela = { chave: string; rotulo: string; obrigatorio: boolean };

/**
 * Formulário das colunas (selects controlados). Trocar uma coluna envia na hora, para a prévia atualizar sem
 * outro toque; "Atualizar prévia" continua como alternativa. `action` com Server Action funciona mesmo antes da hidratação;
 * depois dela o `onSubmit` assume e chama a ação sem o reinício automático do formulário do React 19, que devolvia os
 * selects a "Não importar" quando a ação terminava (a tela mostrava uma coluna e a prévia usava outra).
 */
export function FormularioColunas({
  campos,
  cabecalhos,
  exemplo,
  acao,
}: {
  campos: CampoTela[];
  cabecalhos: string[];
  exemplo: string[];
  acao: (dados: FormData) => Promise<void>;
}) {
  const { selecionado, escolher } = useEstadoImportacao();
  const formulario = useRef<HTMLFormElement>(null);
  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => acao(dados));
  }
  return (
    <form ref={formulario} action={acao} onSubmit={aoEnviar} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        {campos.map((campo) => (
          <div key={campo.chave} className="flex flex-col gap-1.5">
            <label htmlFor={`campo-${campo.chave}`} className={ROTULO}>
              {campo.rotulo}
              {campo.obrigatorio ? ' (obrigatório)' : ''}
            </label>
            <select
              id={`campo-${campo.chave}`}
              name={`campo:${campo.chave}`}
              value={selecionado[campo.chave] ?? ''}
              onChange={(evento) => {
                escolher(campo.chave, evento.target.value);
                formulario.current?.requestSubmit();
              }}
              className={CAMPO}
            >
              <option value="">Não importar</option>
              {cabecalhos.map((cabecalho, i) => (
                <option key={cabecalho} value={cabecalho}>
                  {cabecalho}
                  {exemplo[i] ? ` (ex.: ${exemplo[i].slice(0, 30)})` : ''}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button type="submit" className={BOTAO_SECUNDARIO}>
        Atualizar prévia
      </button>
    </form>
  );
}
