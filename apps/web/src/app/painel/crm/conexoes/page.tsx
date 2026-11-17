import { redirect } from 'next/navigation';

/** A conexão do WhatsApp mudou para Configurações › WhatsApp. Links antigos caem lá. */
export default function ConexoesPage() {
  redirect('/painel/configuracoes?aba=whatsapp');
}
