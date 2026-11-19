'use client';

import { ListaErros } from '@/components/ListaErros';
import { BOTAO_PRIMARIO, CARTAO, ROTULO } from '@/components/estilos';
import { BotaoConfirmar } from '@/components/mercado-livre/BotaoConfirmar';
import { BotaoCopiar } from '@/components/mercado-livre/BotaoCopiar';
import { Dado } from '@/components/mercado-livre/Dado';
import { useEnvioFormulario } from '@/components/useEnvioFormulario';
import type { MotivoCanal } from '@/conectores/marketplace/tipos';
import type { EstadoEnvio } from './acoes';

type Foto = { id: string; rotulo: string; url: string | null };
type Props = {
  acao: (anterior: EstadoEnvio, dados: FormData) => Promise<EstadoEnvio>;
  codigo: string;
  conta: string | null;
  pedidos: string;
  reclamacaoId: string | null;
  motivo: MotivoCanal;
  rotuloMotivo: string;
  mensagem: string;
  fotos: Foto[];
};

/** Modo bitbrain (§4.6, D14): o sistema não envia ao ML; o Gestor responde à mão e marca aqui. */
export function RespondaNoML({ acao, codigo, conta, pedidos, reclamacaoId, motivo, rotuloMotivo, mensagem, fotos }: Props) {
  const [estado, aoEnviar, pendente] = useEnvioFormulario(acao, { erros: [] }, 'erros-responda');
  const prontas = fotos.filter((f): f is Foto & { url: string } => f.url !== null);
  return (
    <section aria-labelledby="titulo-responda" className={`${CARTAO} flex flex-col gap-4`}>
      <h2 id="titulo-responda" className="text-base font-bold">
        Responda no ML
      </h2>
      <p className="text-sm text-texto-2">
        No modo Bitbrain o sistema não envia ao Mercado Livre. Abra no ML a venda {pedidos}
        {reclamacaoId ? ` (reclamação ${reclamacaoId})` : ''}
        {conta ? `, na conta ${conta}` : ''}, escolha o motivo, cole a mensagem e anexe as fotos. Depois, toque em &quot;Marcar como respondida&quot;.
      </p>
      <dl className="grid gap-3">
        <Dado rotulo="Motivo">
          <span className="font-mono">{motivo}</span> · {rotuloMotivo}
        </Dado>
        <Dado rotulo="Mensagem">
          <span className="whitespace-pre-wrap">{mensagem}</span>
        </Dado>
      </dl>
      <BotaoCopiar texto={mensagem} rotuloCopiado="Mensagem copiada." />
      <div className="flex flex-col gap-2">
        <h3 className={ROTULO}>Fotos para anexar no ML</h3>
        {prontas.length === 0 ? (
          <p className="text-sm text-texto-2">Nenhuma foto pronta desta devolução.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {prontas.map((f, i) => (
              <li key={f.id} className="flex flex-col gap-1 rounded-lg border border-borda bg-superficie p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- link temporário assinado (spec §9), sem otimização de imagem */}
                <img src={f.url} alt="" className="aspect-square w-full rounded object-cover" />
                <a href={f.url} download={`${codigo}-${i + 1}.jpg`} className="inline-flex min-h-11 items-center text-sm font-semibold text-destaque underline">
                  Baixar {f.rotulo}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={aoEnviar} className="flex flex-col gap-2 border-t border-borda pt-3">
        <p className="text-xs text-texto-2">&quot;Marcar como respondida&quot; (extra) registra no histórico quem respondeu e quando.</p>
        <ListaErros erros={estado.erros} id="erros-responda" />
        <BotaoConfirmar
          rotulo="Marcar como respondida"
          rotuloConfirmar="Toque de novo para marcar como respondida"
          desabilitado={pendente}
          pendente={pendente}
          rotuloPendente="Marcando…"
          className={`${BOTAO_PRIMARIO} w-full md:w-auto`}
        />
      </form>
    </section>
  );
}
