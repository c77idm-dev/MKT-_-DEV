import type { ReactNode } from 'react';
import { AppShell } from '@/components/AppShell';
import { exigirUsuario } from '@/modules/auth/servidor';
import { sair } from '../login/acoes';

export default async function LayoutAreaLogada({ children }: { children: ReactNode }) {
  const usuario = await exigirUsuario();
  return (
    <AppShell usuario={usuario} acaoSair={sair}>
      {children}
    </AppShell>
  );
}
