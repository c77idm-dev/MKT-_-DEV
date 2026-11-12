'use client';

import { useEffect } from 'react';

const BOTAO = {
  display: 'inline-flex',
  minHeight: '44px',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 20px',
  borderRadius: '9999px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
} as const;

/** Último recurso: erro no layout raiz. Substitui o documento inteiro, por isso traz html, body e estilos próprios. */
export default function ErroGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: '#f2f4f3', color: '#13201d', fontFamily: 'system-ui, sans-serif' }}>
        <main
          role="alert"
          style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px', textAlign: 'center' }}
        >
          <title>Algo deu errado · Gestão de Devoluções</title>
          <h1 style={{ fontSize: '22px', margin: 0 }}>Algo deu errado.</h1>
          <p style={{ fontSize: '14px', color: '#3a4a46', margin: 0 }}>Não foi possível abrir o sistema. Tente de novo; se continuar, volte ao Fluxo.</p>
          <button type="button" onClick={() => retry()} style={{ ...BOTAO, background: '#0f766e', color: '#ffffff', border: 'none' }}>
            Tentar de novo
          </button>
          <a href="/fluxo" style={{ ...BOTAO, background: '#ffffff', color: '#13201d', border: '1px solid #808e89' }}>
            Voltar ao Fluxo
          </a>
        </main>
      </body>
    </html>
  );
}
