import { secretMatches } from '@lps/config';
import { createAdminClient } from '@lps/db';
import { getSiteAccess, type SiteContent, type SiteRow } from '@lps/domain';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { OpenBeacon } from '@/components/template/open-beacon';
import { SiteTemplate } from '@/components/template/site-template';

export const dynamic = 'force-dynamic';

type Row = SiteRow & { slug: string; content: SiteContent };
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ captura?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await createAdminClient().from('sites').select('content').eq('slug', slug).maybeSingle();
  return {
    title: (data?.content as SiteContent | undefined)?.business.name ?? 'Modelo',
    robots: { index: false, follow: false },
  };
}

export default async function ModelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { captura } = await searchParams;
  const { data } = await createAdminClient().from('sites').select('slug, status, published_at, sent_at, expires_at, content').eq('slug', slug).maybeSingle();
  const site = data as Row | null;
  const isCapture = secretMatches(captura, process.env.CAPTURE_TOKEN);
  if (!site || (!isCapture && getSiteAccess(site, new Date()) !== 'ok')) notFound();

  return (
    <>
      <SiteTemplate content={site.content} commercialName={process.env.COMMERCIAL_NAME || 'Sharken'} showVideo={!isCapture} />
      {!isCapture && <OpenBeacon slug={slug} />}
    </>
  );
}
