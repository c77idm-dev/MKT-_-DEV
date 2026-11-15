import type { Instrumentation } from 'next';
import { linhaErroRequisicao } from '@/lib/log';

export const onRequestError: Instrumentation.onRequestError = async (erro, request, context) => {
  console.error(linhaErroRequisicao(erro, request, context, new Date()));
};
