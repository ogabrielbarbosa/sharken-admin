import Link from 'next/link';

export type ConnectionState = 'conectado' | 'desconectado' | 'conectando' | null;

/** Estado da conexão do WhatsApp. Sem registro ainda, mostra "Conexão não verificada". */
export function ConnectionBadge({ state, href }: { state: ConnectionState; href: string }) {
  const on = state === 'conectado';
  const label = on ? 'WhatsApp conectado' : state === 'desconectado' ? 'Desconectado' : state === 'conectando' ? 'Conectando…' : 'Conexão não verificada';
  const dot = on ? 'bg-success' : state === null || state === 'conectando' ? 'bg-warning' : 'bg-destructive';
  const body = (
    <>
      <span className={`size-1.5 rounded-full ${dot}`} />{label}
    </>
  );
  const cls = 'inline-flex items-center gap-1.5 whitespace-nowrap text-xs';
  return state === 'desconectado' ? <Link href={href} className={`${cls} text-destructive hover:underline`}>{body}</Link> : <span className={cls}>{body}</span>;
}
