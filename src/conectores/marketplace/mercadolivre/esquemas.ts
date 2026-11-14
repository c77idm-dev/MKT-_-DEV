import { z } from 'zod';

/**
 * Esquemas das respostas do ML. Toleram campos a mais (`looseObject`) e ids em número ou texto. As suposições
 * A1 a A11 do plano estão aqui e em mapeamento.ts.
 */
const id = z.union([z.number(), z.string().min(1)]).transform(String);
const idOuNulo = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === '' ? null : String(v)));
const textoOuNulo = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const dataOuNula = z
  .string()
  .nullish()
  .transform((v) => {
    if (!v) return null;
    const data = new Date(v);
    return Number.isNaN(data.getTime()) ? null : data;
  });
const quantidade = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === null || v === undefined ? null : String(v)));

function lista<T extends z.ZodType>(item: T) {
  return z
    .array(item)
    .nullish()
    .transform((v) => v ?? []);
}

export const esquemaReclamacao = z.looseObject({
  id,
  resource_id: idOuNulo,
  status: textoOuNulo,
  type: textoOuNulo,
  stage: textoOuNulo,
  players: lista(
    z.looseObject({
      role: textoOuNulo,
      type: textoOuNulo,
      user_id: idOuNulo,
      available_actions: lista(z.looseObject({ action: z.string(), due_date: dataOuNula })),
    }),
  ),
  date_created: dataOuNula,
  last_updated: dataOuNula,
  related_entities: lista(z.string()),
});
export type ReclamacaoJson = z.output<typeof esquemaReclamacao>;

export const esquemaEnvioDevolucao = z.looseObject({
  shipment_id: id,
  status: textoOuNulo,
  tracking_number: textoOuNulo,
  type: textoOuNulo,
  destination: z
    .looseObject({ name: textoOuNulo })
    .nullish()
    .transform((v) => v ?? null),
});
export type EnvioDevolucaoJson = z.output<typeof esquemaEnvioDevolucao>;

export const esquemaDevolucao = z.looseObject({
  id,
  claim_id: idOuNulo,
  type: textoOuNulo,
  subtype: textoOuNulo,
  status: z.string().min(1),
  shipments: lista(esquemaEnvioDevolucao),
  orders: lista(
    z.looseObject({ order_id: id, item_id: idOuNulo, variation_id: idOuNulo, total_quantity: quantidade, return_quantity: quantidade }),
  ),
  date_created: dataOuNula,
  last_updated: dataOuNula,
});
export type DevolucaoJson = z.output<typeof esquemaDevolucao>;

export const esquemaPedido = z.looseObject({
  id,
  order_items: lista(
    z.looseObject({
      item: z.looseObject({ id: idOuNulo, seller_sku: textoOuNulo, seller_custom_field: textoOuNulo, variation_id: idOuNulo }),
    }),
  ),
});
export type PedidoJson = z.output<typeof esquemaPedido>;

const atributos = lista(z.looseObject({ id: z.string(), value_name: textoOuNulo }));
export const esquemaAnuncio = z.looseObject({
  id,
  attributes: atributos,
  variations: lista(z.looseObject({ id: idOuNulo, attributes: atributos })),
});
export type AnuncioJson = z.output<typeof esquemaAnuncio>;

export const esquemaEnvio = z.looseObject({
  id,
  status: textoOuNulo,
  tracking_number: textoOuNulo,
  tracking_method: textoOuNulo,
  status_history: z
    .looseObject({ date_delivered: dataOuNula })
    .nullish()
    .transform((v) => v ?? null),
});

export const esquemaBuscaReclamacoes = z.looseObject({
  paging: z.looseObject({ total: z.number().int().nonnegative() }),
  data: z.array(z.looseObject({ id, last_updated: dataOuNula, related_entities: z.array(z.string()).nullish() })),
});

export const esquemaMotivos = z.array(z.looseObject({ id: z.string() }));
export const esquemaArquivoEnviado = z.looseObject({ file_name: z.string().min(1) });
export const esquemaNotaVenda = z.looseObject({ id });
