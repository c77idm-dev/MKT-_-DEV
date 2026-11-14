import type { Decisao } from '@/modules/conferencia/regras';
import type { TipoEvidencia } from '@/modules/midia/dominio';

/** O assistente da spec §6.3: Fotos 1 e 2; para cada unidade Foto 3, código de barras e Foto 4; Vídeo de Prova; destino. */
export type Passo = { chave: string; rotulo: string } & (
  | { tipo: 'pacote' }
  | { tipo: 'item'; itemId: string; unidade: number }
  | { tipo: 'video' }
  | { tipo: 'destino' }
);

export function montarPassos(itens: { id: string; unidade: number }[]): Passo[] {
  return [
    { chave: 'pacote', rotulo: 'Pacote', tipo: 'pacote' },
    ...itens.map((i): Passo => ({ chave: i.id, rotulo: `Unidade ${i.unidade}`, tipo: 'item', itemId: i.id, unidade: i.unidade })),
    { chave: 'video', rotulo: 'Vídeo de Prova', tipo: 'video' },
    { chave: 'destino', rotulo: 'Destino', tipo: 'destino' },
  ];
}

export type ContextoPasso = {
  enviada(tipo: TipoEvidencia, itemId: string | null): boolean;
  decisao(itemId: string): Decisao | null;
  videoExigido: boolean;
  itens: { id: string }[];
};

export function passoCompleto(p: Passo, c: ContextoPasso): boolean {
  switch (p.tipo) {
    case 'pacote':
      return c.enviada('FOTO_1_ETIQUETA', null) && c.enviada('FOTO_2_EMBALAGEM', null);
    case 'item':
      return c.decisao(p.itemId) === 'AUSENTE' || (c.enviada('FOTO_3_PRODUTO', p.itemId) && c.enviada('FOTO_4_CODIGO_SERIAL', p.itemId));
    case 'video':
      return !c.videoExigido || c.enviada('VIDEO_PROVA', null);
    case 'destino':
      return c.itens.every((i) => c.decisao(i.id) !== null);
  }
}
