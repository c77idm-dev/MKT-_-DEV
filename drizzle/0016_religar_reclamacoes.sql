-- Reparo (E26, 23/11): religa à devolução as reclamações do ML que a sincronização desligou. Uma leitura da reclamação
-- sem a parte da devolução gravava devolucao_id e return_id nulos por cima da ligação (87 de 460 na produção).
-- Só religa quando exatamente uma devolução do ML tem aquela reclamação; rodar de novo não muda nada.
UPDATE "reclamacoes_ml" r
SET "devolucao_id" = d."id",
    "return_id" = coalesce(r."return_id", d."devolucao_externa_id")
FROM "devolucoes" d
WHERE r."devolucao_id" IS NULL
  AND d."canal" = 'MERCADO_LIVRE'
  AND d."reclamacao_id" = r."claim_id"
  AND d."devolucao_externa_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "devolucoes" o
    WHERE o."canal" = 'MERCADO_LIVRE' AND o."reclamacao_id" = r."claim_id" AND o."id" <> d."id"
  );
