import type { ReactNode } from 'react';
import { FotoProduto } from '@/components/FotoProduto';
import { BOTAO_SECUNDARIO, ROTULO } from '@/components/estilos';
import { formatarDataHora, formatarMoeda } from '@/lib/formatar';
import type { FichaVenda as DadosFicha, VendaDaFicha } from '@/modules/mercado-livre/ficha-venda';
import { rotuloSituacaoReclamacao, rotuloSituacaoVenda } from '@/modules/mercado-livre/venda';

/**
 * Ficha da venda (extra, emenda E27): o básico da venda do ML de uma devolução, num bloco compacto e mobile-first. Sem
 * moldura: quem usa põe o cartão e o título (o detalhe da devolução, o Receber pacote, o Conferir pacote e a Retirada do
 * Full). Sem estado nem acesso ao banco: serve em componente de servidor e de cliente. Os botões ("Dar chegada",
 * "Iniciar conferência"...) vêm em `children`, embaixo.
 */

const moeda = (valor: number) => formatarMoeda(valor.toFixed(2));

function Dado({ rotulo, mono = false, children }: { rotulo: string; mono?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className={ROTULO}>{rotulo}</dt>
      <dd className={`text-[15px] ${mono ? 'break-all font-mono' : '[overflow-wrap:anywhere]'}`}>{children}</dd>
    </div>
  );
}

function ItensVendidos({ venda }: { venda: VendaDaFicha }) {
  return (
    <>
      <ul aria-label="Itens vendidos" className="flex flex-col gap-2">
        {venda.itens.map((item, i) => {
          const nome = item.titulo ?? item.sku ?? 'Item sem nome';
          return (
            <li key={`${item.anuncioId ?? ''}-${item.sku ?? ''}-${i}`} className="flex min-w-0 gap-3">
              <FotoProduto url={item.fotoUrl} descricao={nome} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold [overflow-wrap:anywhere]">{nome}</span>
                {item.sku && <span className="break-all font-mono text-xs text-texto-2">SKU {item.sku}</span>}
                <span className="text-sm">
                  {item.quantidade ?? '—'} × {item.valorUnitario === null ? '—' : moeda(item.valorUnitario)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex items-baseline justify-between gap-3 border-t border-borda pt-2">
        <span className={ROTULO}>Total</span>
        <span className="text-base font-bold">{venda.total === null ? '—' : moeda(venda.total)}</span>
      </p>
    </>
  );
}

function BlocoVenda({ venda, conta }: { venda: VendaDaFicha; conta: string | null }) {
  const situacao = rotuloSituacaoVenda(venda.situacao, venda.situacaoEnvio);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        <Dado rotulo="Pedido" mono>
          {venda.pedidoId}
        </Dado>
        {venda.vendidaEm && <Dado rotulo="Data da venda">{formatarDataHora(new Date(venda.vendidaEm))}</Dado>}
        {conta && <Dado rotulo="Conta">{conta}</Dado>}
        {situacao && <Dado rotulo="Situação">{situacao}</Dado>}
      </dl>
      {!venda.temDados && <p className="text-sm text-texto-2">Os dados da venda ainda não chegaram do ML.</p>}
      {venda.itens.length > 0 && <ItensVendidos venda={venda} />}
      {venda.urlNoML && (
        <a href={venda.urlNoML} target="_blank" rel="noopener noreferrer" className={`${BOTAO_SECUNDARIO} w-full sm:w-auto sm:self-start`}>
          Abrir a venda no ML<span className="sr-only"> (abre em outra aba)</span>
        </a>
      )}
    </div>
  );
}

export function FichaVenda({ ficha, mostrarCodigo = false, children }: { ficha: DadosFicha; mostrarCodigo?: boolean; children?: ReactNode }) {
  const situacaoReclamacao = rotuloSituacaoReclamacao(ficha.situacaoReclamacao);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {mostrarCodigo && <p className="font-mono text-lg font-bold">{ficha.codigo}</p>}
      {ficha.vendas.length === 0 ? (
        <p className="text-sm text-texto-2">Os dados da venda ainda não chegaram do ML.</p>
      ) : (
        ficha.vendas.map((venda, i) => (
          <div key={venda.pedidoId} className={i > 0 ? 'border-t border-borda pt-3' : undefined}>
            <BlocoVenda venda={venda} conta={ficha.conta} />
          </div>
        ))
      )}
      {(ficha.motivo || situacaoReclamacao) && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-borda pt-3">
          {ficha.motivo && <Dado rotulo="Motivo da reclamação">{ficha.motivo}</Dado>}
          {situacaoReclamacao && <Dado rotulo="Reclamação">{situacaoReclamacao}</Dado>}
        </dl>
      )}
      {children && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}

/**
 * Uma devolução na lista das devoluções do mesmo pedido (E27: mais de uma esperando o pacote): código DEV, foto e o
 * produto esperado, com a ação ("Dar chegada") em `children`. Sem moldura, como a ficha.
 */
export function ResumoDevolucaoDoPedido({ ficha, children }: { ficha: DadosFicha; children?: ReactNode }) {
  const [produto, ...outros] = ficha.produtos;
  const nome = produto ? (produto.descricao ?? produto.sku) : 'Sem itens cadastrados';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 gap-3">
        <FotoProduto url={produto?.fotoUrl} descricao={nome} tamanho="m" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-mono text-base font-bold">{ficha.codigo}</span>
          <span className="text-sm [overflow-wrap:anywhere]">{nome}</span>
          {produto && (
            <span className="break-all font-mono text-xs text-texto-2">
              SKU {produto.sku} · {produto.quantidade} {produto.quantidade === 1 ? 'unidade' : 'unidades'}
              {outros.length > 0 ? ` · mais ${outros.length} ${outros.length === 1 ? 'produto' : 'produtos'}` : ''}
            </span>
          )}
        </span>
      </div>
      {children && <div className="flex flex-col gap-2">{children}</div>}
    </div>
  );
}
