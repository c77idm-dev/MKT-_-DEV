import type { ItemNotaVenda } from './dominio';

/** D14: unidade da devolução ↔ item da NF de venda. Pelo código do produto (= SKU), depois pelo EAN; se nada casar, o Fiscal escolhe. */
export type UnidadeParaCasar = { itemId: string; unidade: number; sku: string; ean: string | null };
export type NotaVendaParaCasar = {
  notaVendaId: string;
  itens: Pick<ItemNotaVenda, 'numero' | 'codigo' | 'ean' | 'quantidade' | 'itensDevolucaoIds'>[];
};
export type AlvoCasamento = { notaVendaId: string; numeroItem: number };
export type MotivoCasamento = 'ESCOLHA' | 'SKU' | 'EAN';
export type ResultadoCasamento = { itemId: string; alvo: AlvoCasamento | null; por: MotivoCasamento | null };

/** Valor do select da tela: "{notaVendaId}:{numeroItem}". */
export function chaveAlvo(alvo: AlvoCasamento): string {
  return `${alvo.notaVendaId}:${alvo.numeroItem}`;
}

const ALVO = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(\d{1,4})$/i;

export function lerChaveAlvo(texto: string): AlvoCasamento | null {
  const partes = ALVO.exec(texto.trim());
  return partes ? { notaVendaId: partes[1].toLowerCase(), numeroItem: Number(partes[2]) } : null;
}

/** Unidades inteiras de um item ("1.0000" → 1): cada unidade física da devolução ocupa uma. */
export function capacidade(quantidade: number): number {
  return Math.max(0, Math.floor(quantidade + 1e-9));
}

export function casarItens(unidades: UnidadeParaCasar[], notas: NotaVendaParaCasar[]): ResultadoCasamento[] {
  const alvos = notas.flatMap((n) =>
    n.itens.map((i) => ({
      alvo: { notaVendaId: n.notaVendaId, numeroItem: i.numero },
      codigo: i.codigo.trim().toUpperCase(),
      ean: i.ean,
      escolhidos: i.itensDevolucaoIds,
      vagas: capacidade(i.quantidade),
    })),
  );
  const resultado = new Map<string, ResultadoCasamento>();
  const ordenadas = [...unidades].sort((a, b) => a.unidade - b.unidade);

  function ocupar(u: UnidadeParaCasar, a: (typeof alvos)[number], por: MotivoCasamento): boolean {
    if (a.vagas <= 0) return false;
    a.vagas -= 1;
    resultado.set(u.itemId, { itemId: u.itemId, alvo: a.alvo, por });
    return true;
  }

  // 1. O que o Fiscal escolheu vem antes de tudo.
  for (const u of ordenadas) {
    const a = alvos.find((x) => x.escolhidos.includes(u.itemId));
    if (a) ocupar(u, a, 'ESCOLHA');
  }
  // 2. Código do produto = SKU.
  for (const u of ordenadas) {
    if (resultado.has(u.itemId)) continue;
    const sku = u.sku.trim().toUpperCase();
    for (const a of alvos) if (a.codigo === sku && ocupar(u, a, 'SKU')) break;
  }
  // 3. EAN.
  for (const u of ordenadas) {
    if (resultado.has(u.itemId) || !u.ean) continue;
    for (const a of alvos) if (a.ean === u.ean && ocupar(u, a, 'EAN')) break;
  }
  return unidades.map((u) => resultado.get(u.itemId) ?? { itemId: u.itemId, alvo: null, por: null });
}

/** Vagas que sobram em cada item da NF de venda depois do casamento (chave: `chaveAlvo`). */
export function vagasRestantes(notas: NotaVendaParaCasar[], resultado: ResultadoCasamento[]): Map<string, number> {
  const vagas = new Map<string, number>();
  for (const n of notas) for (const i of n.itens) vagas.set(chaveAlvo({ notaVendaId: n.notaVendaId, numeroItem: i.numero }), capacidade(i.quantidade));
  for (const r of resultado) {
    if (!r.alvo) continue;
    const chave = chaveAlvo(r.alvo);
    vagas.set(chave, (vagas.get(chave) ?? 0) - 1);
  }
  return vagas;
}
