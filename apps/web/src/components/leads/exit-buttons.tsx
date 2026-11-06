import { Ban, Trash2 } from 'lucide-react';
import { blockLeadAction, discardLeadAction } from '@/lib/common-lead-actions';
import { Button } from '@/components/ui';

export function ExitButtons({ leadId, className }: { leadId: string; className?: string }) {
  return (
    <div className={className ?? 'flex flex-wrap gap-1'}>
      <form action={discardLeadAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <Button type="submit" variant="ghost" className="px-2"><Trash2 />Descartar</Button>
      </form>
      <form action={blockLeadAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <Button type="submit" variant="ghost" className="px-2"><Ban />Não contatar</Button>
      </form>
    </div>
  );
}
