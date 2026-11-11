import type { ReactNode } from 'react';

/** Cada etapa do batch entra com um leve fade e sobe. */
export default function BatchStepTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
