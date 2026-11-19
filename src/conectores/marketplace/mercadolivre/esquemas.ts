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
  /** Código do motivo da reclamação (ex.: "PDD9949"); o texto vem de /claims/reasons/{id} (melhoria 1). Tipo inesperado vira null. */
  reason_id: idOuNulo.catch(null),
  players: lista(
    z.looseObject({
      role: textoOuNulo,
      type: textoOuNulo,
      user_id: idOuNulo,
      available_actions: lista(z.looseObject({ action: z.string(), due_date: dataOuNula, mandatory: z.boolean().nullish().catch(null) })),
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
  status_money: textoOuNulo.catch(null),
  related_entities: lista(z.string()).catch([]),
});
export type DevolucaoJson = z.output<typeof esquemaDevolucao>;

export const esquemaPedido = z.looseObject({
  id,
  shipping: z.looseObject({ id: idOuNulo }).nullish().catch(null),
  order_items: lista(
    z.looseObject({
      item: z.looseObject({ id: idOuNulo, seller_sku: textoOuNulo, seller_custom_field: textoOuNulo, variation_id: idOuNulo }),
    }),
  ),
});
export type PedidoJson = z.output<typeof esquemaPedido>;

const atributos = lista(z.looseObject({ id: z.string(), value_name: textoOuNulo }));
/** Produtos do ML (extra): título, fotos e miniatura. Campo fora do formato vira vazio, sem derrubar a devolução. */
const textoTolerante = textoOuNulo.catch(null);
export const esquemaAnuncio = z.looseObject({
  id,
  title: textoTolerante,
  secure_thumbnail: textoTolerante,
  thumbnail: textoTolerante,
  pictures: lista(z.looseObject({ id: idOuNulo.catch(null), url: textoTolerante, secure_url: textoTolerante })).catch([]),
  attributes: atributos,
  variations: lista(z.looseObject({ id: idOuNulo, attributes: atributos, picture_ids: lista(idOuNulo).catch([]) })),
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

/** Suposição A15: o texto em português vem em `detail` (ou `description`); `name` costuma ser um código. */
export const esquemaMotivoReclamacao = z.looseObject({ detail: z.unknown().optional(), description: z.unknown().optional(), name: z.unknown().optional() });

export const esquemaMotivos = z.array(z.looseObject({ id: z.string() }));
export const esquemaArquivoEnviado = z.looseObject({ file_name: z.string().min(1) });
export const esquemaNotaVenda = z.looseObject({ id });

/** Suposição A17: GET /post-purchase/v1/claims/{id}/affects-reputation. */
export const esquemaReputacao = z.looseObject({ affects_reputation: textoOuNulo });

const esquemaRevisao = z.looseObject({
  resource_reviews: lista(z.looseObject({ product_condition: textoOuNulo, stage: textoOuNulo })),
});
/** Suposição A16: GET /post-purchase/v1/returns/{id}/reviews traz { reviews: [...] } ou a lista direto. Sai sempre a lista. */
export const esquemaRevisoes = z.union([z.array(esquemaRevisao), z.looseObject({ reviews: lista(esquemaRevisao) }).transform((v) => v.reviews)]);

/** Suposição A18: envio da venda; logistic_type no formato antigo, logistic.type no novo (x-format-new). */
export const esquemaEnvioVenda = z.looseObject({
  logistic_type: textoOuNulo,
  logistic: z.looseObject({ type: textoOuNulo }).nullish().catch(null),
});
