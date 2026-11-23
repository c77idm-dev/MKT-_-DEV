/**
 * (extra, emenda E25) Os outros números da etiqueta do Mercado Livre. Na etiqueta do pacote que o ML manda de volta à
 * loja, o leitor às vezes pega o número do pedido ou o do envio, e não o rastreio guardado. O Recebimento procura por eles
 * só depois do rastreio exato, só quando o código lido é feito só de dígitos (os rastreios têm letras) e só nas devoluções
 * do canal MERCADO_LIVRE. Por isso o tamanho do número do pedido não é limitado: um número curto só acharia um pedido do
 * ML igual a ele inteiro.
 */
const SO_DIGITOS = /^\d+$/;

/** O número do envio do ML tem 11 dígitos; 10 a 12 são aceitos por segurança, caso o ML mude a numeração. */
const DIGITOS_ENVIO = { min: 10, max: 12 } as const;

/**
 * Número do pedido do ML: o próprio código e, com 15 dígitos, também "2" + código (a etiqueta corta o 2 do começo do pedido
 * de 16 dígitos: "000018992531744" é o pedido 2000018992531744). A comparação é sempre do número inteiro, sem pedaços.
 */
export function pedidosDoCodigo(codigo: string): string[] {
  if (!SO_DIGITOS.test(codigo)) return [];
  return codigo.length === 15 ? [codigo, `2${codigo}`] : [codigo];
}

/**
 * Número do envio do ML dentro do rastreio do Mercado Envios: 2 a 4 letras, o número e uma letra logo depois
 * (MM48503476449BRSP02, MM48348229363BRPR01, MEL48249814112FMDOR01). Devolve a expressão para o operador `~` do Postgres
 * (o rastreio é guardado em maiúsculas), ou null quando o código não pode ser um número de envio. As letras dos dois lados
 * impedem achar o número dentro de outro número maior.
 */
export function padraoRastreioDoEnvioML(codigo: string): string | null {
  if (!SO_DIGITOS.test(codigo) || codigo.length < DIGITOS_ENVIO.min || codigo.length > DIGITOS_ENVIO.max) return null;
  return `^[A-Z]{2,4}${codigo}[A-Z]`;
}
