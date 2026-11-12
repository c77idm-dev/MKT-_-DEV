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
