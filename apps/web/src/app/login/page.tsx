import { Logo } from '@/components/layout/logo';
import { Button, Field, Input } from '@/components/ui';
import { signIn } from './actions';

const messages: Record<string, string> = {
  credenciais: 'E-mail ou senha incorretos.',
  config: 'Faltam as chaves do Supabase. Rode pnpm setup:local e reinicie o servidor.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-rise">
        <Logo className="mx-auto mb-8 h-7 w-auto text-[#f4f3f3]" />
        <form action={signIn} className="space-y-4 rounded-card border border-border bg-card p-6">
          <div>
            <h1 className="text-lg font-semibold">Entrar no painel</h1>
          </div>
          {erro && messages[erro] && <p className="text-sm text-destructive">{messages[erro]}</p>}
          <Field label="E-mail"><Input name="email" type="email" placeholder="voce@email.com" required /></Field>
          <Field label="Senha"><Input name="password" type="password" placeholder="••••••••••" required /></Field>
          <Button type="submit" className="w-full">Entrar</Button>
        </form>
      </div>
    </main>
  );
}
