import { Button, Field, Input } from '@/components/ui';
import { signIn } from './actions';

const messages: Record<string, string> = {
  credenciais: 'E-mail ou senha incorretos.',
  config: 'Configure as chaves do Supabase no arquivo .env.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <img src="/logo.png" alt="Sharken" className="mx-auto mb-8 h-6" />
        <form action={signIn} className="space-y-4 rounded-card border border-border bg-card p-6">
          <div>
            <h1 className="text-lg font-semibold">Entrar no painel</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acesse sua conta para continuar a prospecção.</p>
          </div>
          {erro && messages[erro] && <p className="text-sm text-destructive">{messages[erro]}</p>}
          <Field label="E-mail"><Input name="email" type="email" placeholder="voce@email.com" required /></Field>
          <Field label="Senha"><Input name="password" type="password" placeholder="••••••••••" required /></Field>
          <Button type="submit" className="w-full">Entrar</Button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">Painel de uso individual · Sharken</p>
      </div>
    </main>
  );
}
