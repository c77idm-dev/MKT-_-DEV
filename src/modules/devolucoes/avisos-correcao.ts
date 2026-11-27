/**
 * (extra, E29) Os avisos que as correções do Gestor devolvem quando dão certo (`ResultadoCorrecao.aviso`). A tela recebe
 * só a chave pela URL (`?aviso=`), para um link não pôr texto qualquer na página.
 */
export const AVISOS_CORRECAO = {
  contestacao_enviada: 'A contestação desta devolução já foi enviada ao Mercado Livre e continua lá.',
  contestacao_falhou: 'A contestação desta devolução falhou no envio e continua em Contestações: revise-a antes de enviar de novo.',
  contestacao_pedida: 'O envio da contestação desta devolução ao Mercado Livre já foi pedido: ela continua lá.',
} as const;

export type ChaveAviso = keyof typeof AVISOS_CORRECAO;

export function chaveDoAviso(texto: string | null): ChaveAviso | null {
  if (!texto) return null;
  const achada = (Object.keys(AVISOS_CORRECAO) as ChaveAviso[]).find((chave) => AVISOS_CORRECAO[chave] === texto);
  return achada ?? null;
}

export function textoDoAviso(chave: string): string | null {
  return Object.hasOwn(AVISOS_CORRECAO, chave) ? AVISOS_CORRECAO[chave as ChaveAviso] : null;
}

/** `corrigirDados` sem mudança nenhuma: nada é gravado, e o formulário mostra isto (ele fica na tela). */
export const AVISO_NADA_MUDOU = 'Nenhum dado mudou.';
