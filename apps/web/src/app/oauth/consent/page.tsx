import { redirect } from 'next/navigation';
import { Logo } from '@/components/layout/logo';
import { Button } from '@/components/ui';
import { createServerClient } from '@/lib/supabase/server';
import { approve, deny } from './actions';
import { redirectHost } from './redirect-host';

const messages: Record<string, string> = {
  falhou: 'Não foi possível concluir. Tente de novo.',
  invalido: 'Pedido de autorização inválido ou expirado.',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-rise">
        <Logo className="mx-auto mb-8 h-7 w-auto text-[#f4f3f3]" />
        <div className="space-y-4 rounded-card border border-border bg-card p-6">{children}</div>
      </div>
    </main>
  );
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ authorization_id?: string; erro?: string }> }) {
  const { authorization_id: id, erro } = await searchParams;
  if (!id) {
    return <Shell><p className="text-sm text-destructive">{messages.invalido}</p></Shell>;
  }

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`)}`);

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) {
    return <Shell><p className="text-sm text-destructive">{messages.invalido}</p></Shell>;
  }
  if ('redirect_url' in data) redirect(data.redirect_url);

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Autorizar acesso</h1>
      {erro && messages[erro] && <p className="text-sm text-destructive">{messages[erro]}</p>}
      <p className="text-sm">
        <strong>{data.client.name}</strong> quer acessar sua conta da Sharken.
      </p>
      <p className="text-sm">Vai voltar para: <strong>{redirectHost(data.redirect_uri)}</strong></p>
      <p className="text-sm">Você está entrando como <strong>{user.email ?? data.user.email}</strong></p>
      <p className="text-sm text-muted-foreground">
        Vai poder ler os dados dos seus workspaces (batches, leads e conversas pelo MCP), sem alterar nada. Só autorize se foi você que pediu essa conexão agora.
      </p>
      <div className="flex gap-2">
        <form action={deny.bind(null, id)} className="flex-1">
          <Button type="submit" variant="outline" className="w-full">Recusar</Button>
        </form>
        <form action={approve.bind(null, id)} className="flex-1">
          <Button type="submit" className="w-full">Autorizar</Button>
        </form>
      </div>
    </Shell>
  );
}
