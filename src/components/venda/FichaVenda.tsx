import type { ReactNode } from 'react';
import { FotoProduto } from '@/components/FotoProduto';
import { BOTAO_SECUNDARIO, ROTULO } from '@/components/estilos';
import { formatarDataHora, formatarMoeda } from '@/lib/formatar';
import type { FichaVenda as DadosFicha, ProdutoDaDevolucao, VendaDaFicha } from '@/modules/mercado-livre/ficha-venda';
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

const unidades = (n: number) => `${n} ${n === 1 ? 'unidade' : 'unidades'}`;

/**
 * Sem os dados da venda. (24/11) A devolução do ML sem reclamação no sistema (criada à mão) nunca os recebe: a venda só
 * é lida pela reclamação. Aí a ficha diz por quê, em vez de "ainda não chegaram".
 */
function SemDadosDaVenda({ temReclamacao }: { temReclamacao: boolean }) {
  return (
    <p className="text-sm text-texto-2">
      {temReclamacao ? 'Os dados da venda ainda não chegaram do ML.' : 'Sem os dados da venda do ML (devolução sem reclamação no sistema).'}
    </p>
  );
}

/**
 * (extra) Sem os itens da venda, a ficha de uma devolução nas telas do Fluxo mostra o que ela espera receber (os itens
 * da devolução, com a foto do cadastro), para a pessoa comparar com o pacote na mão antes de tocar.
 */
function ProdutosEsperados({ produtos }: { produtos: ProdutoDaDevolucao[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 border-t border-borda pt-3">
      <p className={ROTULO}>
        {produtos.length === 1 ? 'Produto esperado' : 'Produtos esperados'}
      </p>
      <ul aria-label="Produto esperado" className="flex flex-col gap-2">
        {produtos.map((p) => {
          const nome = p.descricao ?? p.sku;
          return (
            <li key={p.sku} className="flex min-w-0 gap-3">
              <FotoProduto url={p.fotoUrl} descricao={nome} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold [overflow-wrap:anywhere]">{nome}</span>
                <span className="break-all font-mono text-xs text-texto-2">
                  SKU {p.sku} · {unidades(p.quantidade)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function BlocoVenda({ venda, conta, temReclamacao }: { venda: VendaDaFicha; conta: string | null; temReclamacao: boolean }) {
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
      {!venda.temDados && <SemDadosDaVenda temReclamacao={temReclamacao} />}
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
  // (extra) Nas telas do Fluxo (com o código DEV), sem os itens da venda: o produto esperado, para comparar com o pacote.
  const semItensDaVenda = !ficha.vendas.some((v) => v.itens.length > 0);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {mostrarCodigo && <p className="font-mono text-lg font-bold">{ficha.codigo}</p>}
      {ficha.vendas.length === 0 ? (
        <SemDadosDaVenda temReclamacao={ficha.temReclamacao} />
      ) : (
        ficha.vendas.map((venda, i) => (
          <div key={venda.pedidoId} className={i > 0 ? 'border-t border-borda pt-3' : undefined}>
            <BlocoVenda venda={venda} conta={ficha.conta} temReclamacao={ficha.temReclamacao} />
          </div>
        ))
      )}
      {mostrarCodigo && semItensDaVenda && ficha.produtos.length > 0 && <ProdutosEsperados produtos={ficha.produtos} />}
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
