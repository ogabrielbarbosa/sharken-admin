export const metadata = { robots: { index: false, follow: false } };

export default function ModelUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-neutral-700">
      <p>Este modelo não está mais disponível.</p>
    </main>
  );
}
