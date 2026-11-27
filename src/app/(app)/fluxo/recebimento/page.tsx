import { redirect } from 'next/navigation';

/**
 * (E29) O Receber pacote mora na Bancada (o formulário, as ações e as proteções da câmera continuam nesta pasta).
 * O endereço antigo leva para lá; quem não recebe pacotes (o Fiscal) cai no "não encontrada" da Bancada, como antes.
 */
export default function PaginaRecebimento() {
  redirect('/bancada');
}
