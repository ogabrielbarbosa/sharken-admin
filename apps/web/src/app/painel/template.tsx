import type { ReactNode } from 'react';

/** Remonta a cada navegação: a tela entra com um leve fade e sobe. */
export default function PainelTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
