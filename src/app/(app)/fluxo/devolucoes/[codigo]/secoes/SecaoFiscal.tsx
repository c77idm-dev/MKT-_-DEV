import { BlocoItensVenda, BlocoNotaDevolucao, BlocoNotaVenda } from '@/components/fiscal/BlocosFiscais';
import { CARTAO } from '@/components/estilos';
import { obterDb } from '@/db';
import { pode } from '@/modules/auth/permissoes';
import type { UsuarioSessao } from '@/modules/auth/usuarios';
import type { StatusDevolucao } from '@/modules/devolucoes/dominio';
import { obterSituacaoFiscal } from '@/modules/fiscal/situacao';
import { obterArmazenamento } from '@/modules/midia/armazenamento';
import { acaoEscolherItem, acaoNotaDevolucao, acaoNotaVenda } from './acoes-fiscal';

/** Spec §9: links temporários de 10 min, nunca públicos. */
const SEGUNDOS_LINK = 10 * 60;

type Props = { devolucaoId: string; codigo: string; status: StatusDevolucao; usuario: UsuarioSessao };

/** Seção "Fiscal" do detalhe (contrato §2, P2 item 9): NF de venda, casamento dos itens (D14) e NF de devolução. */
export async function SecaoFiscal({ devolucaoId, codigo, status, usuario }: Props) {
  const s = await obterSituacaoFiscal(obterDb(), devolucaoId);
  const aguardando = status === 'AGUARDANDO_NF';
  const relevante = aguardando || status === 'CONCLUIDA' || s.notaAtiva !== null || s.anteriores.length > 0 || s.notasVenda.length > 0;
  if (!relevante) return null;

  const podeFiscal = pode(usuario.perfil, 'gerir_fiscal');
  const nota = s.notaAtiva;
  // NF de venda e escolha dos itens: só antes da NF (ou depois de uma rejeição, para corrigir).
  const podeMexer = podeFiscal && aguardando && (!nota || nota.situacao === 'REJEITADA');
  let links: { xml: string; danfe: string } | null = null;
  if (nota?.situacao === 'AUTORIZADA' && nota.xmlCaminho && nota.danfeCaminho) {
    const armazenamento = obterArmazenamento();
    links = {
      xml: await armazenamento.urlTemporaria(nota.xmlCaminho, SEGUNDOS_LINK),
      danfe: await armazenamento.urlTemporaria(nota.danfeCaminho, SEGUNDOS_LINK),
    };
  }

  return (
    <section aria-labelledby="titulo-fiscal" className={`${CARTAO} flex flex-col gap-5`}>
      <h2 id="titulo-fiscal" className="text-base font-bold">
        Fiscal
      </h2>
      <BlocoNotaDevolucao
        acao={acaoNotaDevolucao.bind(null, devolucaoId, codigo)}
        nota={nota}
        anteriores={s.anteriores}
        links={links}
        podeEmitir={podeFiscal && aguardando && !nota}
        podeReenviar={podeFiscal && nota?.situacao === 'REJEITADA'}
        podeCancelar={podeFiscal && nota?.podeCancelar === true}
      />
      <BlocoNotaVenda
        acao={acaoNotaVenda.bind(null, devolucaoId, codigo)}
        notas={s.notasVenda}
        podeAnexar={podeMexer}
        podeBuscarMl={podeMexer && s.canalMercadoLivre}
        podeRemover={podeMexer}
      />
      {aguardando && s.notasVenda.length > 0 && s.unidades.length > 0 && (
        <BlocoItensVenda acao={acaoEscolherItem.bind(null, devolucaoId, codigo)} unidades={s.unidades} opcoes={s.opcoes} podeEscolher={podeMexer} />
      )}
    </section>
  );
}
