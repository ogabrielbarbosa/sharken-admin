import { createAdminClient } from '@lps/db';
import type { SiteContent } from '@lps/domain';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpenBeacon } from '@/components/template/open-beacon';
import { SiteTemplate } from '@/components/template/site-template';
import { lookupPage } from '@/lib/page-access';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ captura?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await createAdminClient().from('sites').select('content').eq('slug', slug).maybeSingle();
  return {
    title: (data?.content as SiteContent | undefined)?.business?.name ?? 'Modelo',
    robots: { index: false, follow: false },
  };
}

export default async function ModelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { captura } = await searchParams;
  const found = await lookupPage(slug, captura);
  if (found.kind !== 'ok') notFound();
  const { site, capture, preview } = found;

  return (
    <>
      <SiteTemplate content={site.content as SiteContent} commercialName={process.env.COMMERCIAL_NAME || 'Sharken'} showVideo={!capture} />
      {!preview && <OpenBeacon slug={slug} />}
    </>
  );
}
