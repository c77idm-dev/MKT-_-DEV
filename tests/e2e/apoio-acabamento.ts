import type { Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import { devolucoes } from '@/db/schema';
import type { NomeTarefa } from '@/modules/fila/tarefas';
import { criarDevolucaoTeste } from '../helpers/fabricas';
import { criarFalhaTeste, criarNotaRejeitadaTeste } from '../helpers/fabricas-acabamento';
import { codigoUnico, comBanco, usuarioPorEmail } from './apoio';
import { USUARIOS_E2E } from './dados';

/** Falha ABERTA gravada direto no banco, com um erro único por execução (o banco do e2e é o mesmo para os dois projetos). */
export async function prepararFalha(p: { tarefa?: NomeTarefa; dados?: Record<string, unknown> } = {}): Promise<{ falhaId: string; erro: string }> {
  const erro = codigoUnico('Erro de teste ');
  const { id } = await comBanco((db) => criarFalhaTeste(db, { tarefa: p.tarefa, dados: p.dados, erro }));
  return { falhaId: id, erro };
}

/** Devolução com o prazo de conferência do canal vencendo em poucas horas (alerta "prazo do ML"). */
export async function prepararPrazoVencendo(): Promise<{ codigo: string }> {
  return comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    const dev = await criarDevolucaoTeste(db, gestor);
    await db
      .update(devolucoes)
      .set({ prazoConferenciaCanal: new Date(Date.now() + 3 * 60 * 60 * 1000) })
      .where(eq(devolucoes.id, dev.id));
    return { codigo: dev.codigo };
  });
}

/** Devolução com uma NF rejeitada (alerta "NF rejeitada"). */
export async function prepararNotaRejeitada(): Promise<{ codigo: string }> {
  return comBanco(async (db) => {
    const gestor = await usuarioPorEmail(db, USUARIOS_E2E.gestor.email);
    const dev = await criarDevolucaoTeste(db, gestor);
    await criarNotaRejeitadaTeste(db, { devolucaoId: dev.id });
    return { codigo: dev.codigo };
  });
}

/**
 * Junta as violações da CSP (evento securitypolicyviolation do próprio navegador) numa lista do lado do teste.
 * A lista fica no Node, e não na janela: sobrevive às navegações (a conferência termina abrindo outra página).
 */
export async function vigiarCsp(page: Page): Promise<string[]> {
  const lista: string[] = [];
  await page.exposeFunction('registrarViolacaoCsp', (texto: string) => lista.push(texto));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      void (window as unknown as { registrarViolacaoCsp: (t: string) => Promise<void> }).registrarViolacaoCsp(
        `${e.violatedDirective} ${e.blockedURI} em ${location.pathname}`,
      );
    });
  });
  return lista;
}
