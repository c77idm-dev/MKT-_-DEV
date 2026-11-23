/** Fase 3 (já com todas as chaves do plano da Fase 3). Congelado depois da Parte A: chave nova = emenda (contrato §10, E3). */
export const ROTULOS_MERCADO_LIVRE: Record<string, string> = {
  ml_vinculada: 'Ligada à devolução do Mercado Livre',
  ml_status_atualizado: 'Status do Mercado Livre atualizado',
  ml_entregue: 'Entregue segundo o Mercado Livre',
  ml_no_cd: 'No CD do Mercado Livre',
  ml_reenviada_ao_vendedor: 'Reenviada ao vendedor pelo Mercado Livre',
  ml_status_apos_chegada: 'Status do Mercado Livre mudou depois da chegada',
  ml_resultado_ok_enviado: 'Resultado "OK" enviado ao Mercado Livre',
  ml_resultado_ok_recusado: 'O Mercado Livre recusou o resultado "OK"',
  ml_resultado_sem_vinculo: 'Resultado não enviado ao ML: devolução sem vínculo com o Mercado Livre',
  ml_conta_conectada: 'Conta do Mercado Livre conectada',
  ml_conta_reconectar: 'Conta do Mercado Livre precisa ser reconectada',
  ml_conta_desconectada: 'Conta do Mercado Livre desconectada',
  // Integração Bitbrain (emenda E21)
  ml_conta_bitbrain_marcada: 'Conta do Bitbrain passou a mandar devoluções',
  ml_conta_bitbrain_desmarcada: 'Conta do Bitbrain deixou de mandar devoluções',
  ml_resposta_manual_pendente: 'Falta responder "OK" no Mercado Livre (à mão)',
  ml_ok_respondido_a_mao: '"OK" respondido à mão no Mercado Livre',
  ml_contestacao_respondida_a_mao: 'Contestação respondida à mão no Mercado Livre',
  // Produtos do ML (emenda E22, extra)
  ml_produto_criado: 'Produto cadastrado pelo anúncio do Mercado Livre',
  ml_produto_completado: 'Foto, EAN ou anúncio do produto preenchidos pelo Mercado Livre',
  contestacao_criada: 'Contestação criada',
  contestacao_revisada: 'Contestação revisada pelo Gestor',
  contestacao_enviada: 'Contestação enviada ao Mercado Livre',
  contestacao_falhou: 'Falha no envio da contestação',
};
