import Link from 'next/link';
import { Logo } from '@/components/layout/logo';
import { Button, Field, Input } from '@/components/ui';
import { signUp } from '../login/actions';

const messages: Record<string, string> = {
  nome: 'O nome precisa ter entre 2 e 80 caracteres.',
  email: 'E-mail inválido.',
  'senha-curta': 'A senha precisa ter pelo menos 8 caracteres.',
  'senha-diferente': 'As senhas não são iguais.',
  'ja-existe': 'Já existe uma conta com esse e-mail. Entre com ela.',
  'sem-convite': 'Esse e-mail ainda não foi adicionado a nenhum workspace. Peça para quem te convidou adicionar o seu e-mail.',
  falhou: 'Não foi possível criar a conta. Tente de novo.',
  config: 'Faltam as chaves do Supabase.',
};

export default async function CadastroPage({ searchParams }: { searchParams: Promise<{ erro?: string; email?: string; next?: string }> }) {
  const { erro, email, next } = await searchParams;
  return (
    <main className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-rise">
        <Logo className="mx-auto mb-8 h-7 w-auto text-[#f4f3f3]" />
        <form action={signUp} className="space-y-4 rounded-card border border-border bg-card p-6">
          {next && <input type="hidden" name="next" value={next} />}
          <div>
            <h1 className="text-lg font-semibold">Criar conta</h1>
            <p className="mt-1 text-sm text-muted-foreground">Use o e-mail em que você foi convidado. Você entra direto no seu workspace.</p>
          </div>
          {erro && messages[erro] && <p className="text-sm text-destructive">{messages[erro]}</p>}
          <Field label="Nome" hint="Aparece para a equipe no chat"><Input name="name" minLength={2} maxLength={80} autoComplete="name" required /></Field>
          <Field label="E-mail"><Input name="email" type="email" defaultValue={email ?? ''} placeholder="voce@email.com" required /></Field>
          <Field label="Senha" hint="Mínimo de 8 caracteres"><Input name="password" type="password" minLength={8} required /></Field>
          <Field label="Repita a senha"><Input name="confirm" type="password" minLength={8} required /></Field>
          <Button type="submit" className="w-full">Criar conta</Button>
          <p className="text-center text-sm text-muted-foreground">Já tem conta? <Link href={next ? `/login?${new URLSearchParams({ next })}` : '/login'} className="text-foreground underline">Entrar</Link></p>
        </form>
      </div>
    </main>
  );
}
