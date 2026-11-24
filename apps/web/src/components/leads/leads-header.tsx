import { SubPageHeader } from '@/components/layout/sub-page-header';

const PAGES = [
  { href: '/painel/leads', label: 'Todos os leads' },
  { href: '/painel/batches', label: 'Batches' },
] as const;

/** Cabeçalho de Leads, igual nas duas subpáginas. */
export function LeadsHeader({ current }: { current: 'leads' | 'batches' }) {
  return <SubPageHeader label="Leads" pages={PAGES} current={`/painel/${current}`} />;
}
