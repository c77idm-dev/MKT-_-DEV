import { existsSync } from 'node:fs';

// O playwright.config.ts importa este arquivo antes de carregar o .env, então o .env é lido aqui.
if (existsSync('.env')) process.loadEnvFile('.env');

export const PORTA_E2E = Number(process.env.PORTA_E2E || 3100);
export const URL_E2E = `http://localhost:${PORTA_E2E}`;

export const USUARIOS_E2E = {
  gestor: { nome: 'Gestora Teste', email: 'gestor@teste.local', senha: 'senha-gestor-123', perfil: 'GESTOR' as const },
  operador: { nome: 'Operador Teste', email: 'operador@teste.local', senha: 'senha-operador-123', perfil: 'OPERADOR' as const },
  fiscal: { nome: 'Fiscal Teste', email: 'fiscal@teste.local', senha: 'senha-fiscal-123', perfil: 'FISCAL' as const },
};

/**
 * Ambiente do servidor e do worker do e2e: mídia no disco local (.dados-e2e), links assinados e os falsos.
 * PERMITIR_FALSOS=1 é o que deixa o build de produção do e2e (`next start`) aceitar os falsos (contrato §10, E1).
 * É o ÚNICO lugar que define essa variável.
 */
export const AMBIENTE_E2E = {
  ARMAZENAMENTO: 'disco',
  MIDIA_DIR: '.dados-e2e/midia',
  MIDIA_TMP_DIR: '.dados-e2e/tmp',
  SEGREDO_LINKS: 'segredo-dos-testes-ponta-a-ponta-com-mais-de-32-caracteres',
  ML_CONECTOR: 'falso',
  EMISSOR_NFE: 'falso',
  PERMITIR_FALSOS: '1',
} as const;
