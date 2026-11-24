import type { EstadoRecebimento } from './acoes';

/**
 * A câmera lê em sequência e pode "ver" outro código enquanto o anterior ainda é processado ou enquanto a pessoa
 * decide o que fazer com um rastreio desconhecido. Nesses momentos a leitura é ignorada.
 *
 * (extra, E27) Também com a ficha (ou a lista) achada pelo número do pedido na tela: a câmera não manda nada, nem o
 * mesmo pedido nem outro código da mesma etiqueta (o número do envio novo do armazém, o rastreio novo ou o QR). Sem
 * isso, um código que o sistema não conhece trocaria a ficha por "Rastreio não encontrado" (e o caminho oferecido
 * criaria uma não identificada a mais), e um QR longo, por um erro, antes do toque. A pessoa toca em "Dar chegada" ou
 * digita outro código no campo, como no "Rastreio não encontrado".
 */
export function podeAceitarLeitura(pendente: boolean, estado: EstadoRecebimento): boolean {
  return !pendente && estado.tipo !== 'nao_encontrada' && estado.tipo !== 'escolher';
}

/**
 * (extra, E27) O cartão que fica diante de outro código da mesma etiqueta lido pela câmera: o verde de qualquer chegada
 * e (24/11, aprovado pelo usuário) o amarelo "Este pacote já chegou". Os códigos DEV dele; em outra tela (o "Fale com o
 * Gestor" inclusive), nenhum.
 */
function codigosDoCartaoQueFica(estado: EstadoRecebimento): readonly string[] {
  return estado.tipo === 'sucesso' || (estado.tipo === 'aviso' && estado.jaChegou) ? estado.codigos : [];
}

/**
 * (extra, E25) A etiqueta do ML tem vários códigos (rastreio, pedido, envio) e a câmera continua lendo depois do cartão
 * verde. Outro código da mesma etiqueta acha a mesma devolução e o "Este pacote já chegou" cobriria o cartão verde (e o
 * aviso do armazém do ML) em menos de 1 s. Pela câmera, esse "já chegou" de uma devolução que já está no cartão verde é a
 * mesma leitura: o cartão fica. Pelo campo (digitação ou leitor USB) nada muda.
 *
 * `codigos`: a devolução do aviso ou, (extra, E27) achada pelo número do pedido, todas as do pedido. O aviso fala da
 * mais recente do pedido, que pode ser outra, já recebida antes (ou cancelada): se o cartão verde é de uma devolução
 * desse pedido, continua sendo a mesma etiqueta.
 *
 * (24/11) Vale também para o amarelo "Este pacote já chegou" (codigosDoCartaoQueFica): ele fica diante do número do
 * pedido e de outro código da mesma devolução. Sem a 2ª parte, a câmera que alterna entre o rastreio e o pedido da
 * etiqueta tiraria e poria o aviso das que ainda esperam a cada leitura.
 */
export function mesmaLeituraDaCamera(anterior: EstadoRecebimento, daCamera: boolean, codigos: readonly string[]): boolean {
  return daCamera && codigosDoCartaoQueFica(anterior).some((c) => codigos.includes(c));
}

/**
 * (extra, E27) Pelo número do pedido a tela mostra a ficha (ou a lista) e espera o toque em "Dar chegada".
 * `codigosDoPedido`: todas as devoluções do pedido lido, em qualquer status. Pela câmera, a leitura é da mesma etiqueta:
 * - com o cartão verde de uma devolução do pedido, qualquer que tenha sido a chegada (pelo rastreio, pelo número do
 *   envio ou por "Dar chegada"). Sem isso, a outra devolução do mesmo pedido, que ainda espera o pacote, apareceria no
 *   lugar dele em menos de 1 s com "Dar chegada", e um toque registraria a chegada de um pacote que não veio. O cartão
 *   fica, com o aviso das que ainda esperam (comAvisoDoPedido);
 * - (24/11) com o amarelo "Este pacote já chegou" de uma devolução do pedido (lida pelo rastreio, pelo número do envio
 *   ou pelo pedido, ou depois de "Dar chegada"), pelo mesmo motivo. O "Fale com o Gestor" continua dando lugar à ficha;
 * - com a ficha aberta e alguma devolução dela no pedido. É só defesa: com a ficha na tela a câmera não manda nada
 *   (podeAceitarLeitura); vale para uma leitura mandada logo antes de a ficha aparecer.
 * Pelo campo (digitação ou leitor USB) a resposta nova aparece.
 */
export function mesmoPedidoDaCamera(anterior: EstadoRecebimento, daCamera: boolean, codigosDoPedido: readonly string[]): boolean {
  if (anterior.tipo === 'escolher') return daCamera && anterior.fichas.some((f) => codigosDoPedido.includes(f.codigo));
  return mesmaLeituraDaCamera(anterior, daCamera, codigosDoPedido);
}

/**
 * (extra, E27) O cartão que fica diante de outro código do mesmo pedido (o verde ou, 24/11, o amarelo "Este pacote já
 * chegou") avisa quais devoluções desse pedido ainda esperam o pacote (`aindaEsperam`; vazio tira o aviso): quem recebe
 * pela câmera os pacotes do mesmo pedido não segue achando que o 2º também chegou. Sem mudança, devolve o mesmo estado;
 * fora desses cartões, nada muda.
 */
export function comAvisoDoPedido(anterior: EstadoRecebimento, aindaEsperam: readonly string[]): EstadoRecebimento {
  const cartao = anterior.tipo === 'sucesso' || (anterior.tipo === 'aviso' && anterior.jaChegou) ? anterior : null;
  if (!cartao) return anterior;
  const novas = aindaEsperam.filter((c) => !cartao.codigos.includes(c));
  const atuais = cartao.aindaEsperam ?? [];
  if (novas.length === atuais.length && novas.every((c, i) => c === atuais[i])) return cartao;
  if (novas.length > 0) return { ...cartao, aindaEsperam: novas };
  const semAviso = { ...cartao };
  delete semAviso.aindaEsperam;
  return semAviso;
}
