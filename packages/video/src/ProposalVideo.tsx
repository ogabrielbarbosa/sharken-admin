import type { CSSProperties } from 'react';
import { AbsoluteFill, Audio, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';

export type NarrationClip = { src: string; from: number; durationInFrames: number };

export type ProposalVideoProps = {
  narration: NarrationClip[];
  durationInFrames: number;
  beforeSiteSrc?: string;
  beforeSiteFrames?: number;
  pageScrollSrc: string;
  businessName: string;
  city: string;
};

const label: CSSProperties = {
  position: 'absolute',
  left: 48,
  bottom: 48,
  padding: '18px 26px',
  borderRadius: 16,
  background: 'rgba(10,10,10,.85)',
  color: '#fafafa',
  fontFamily: 'Helvetica, Arial, sans-serif',
};

function BusinessLabel({ name, city }: { name: string; city: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps / 2, fps * 6, fps * 6.5], [0, 1, 1, 0], { extrapolateRight: 'clamp' });
  return (
    <div style={{ ...label, opacity }}>
      <div style={{ fontSize: 34, fontWeight: 700 }}>{name}</div>
      <div style={{ fontSize: 22, opacity: 0.75, marginTop: 4 }}>Modelo preparado para {city}</div>
    </div>
  );
}

export function ProposalVideo(props: ProposalVideoProps) {
  const before = props.beforeSiteSrc ? props.beforeSiteFrames ?? 0 : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: '#fff' }}>
      {props.beforeSiteSrc && before > 0 && (
        <Sequence durationInFrames={before}>
          <OffthreadVideo src={props.beforeSiteSrc} muted />
        </Sequence>
      )}
      <Sequence from={before}>
        <OffthreadVideo src={props.pageScrollSrc} muted />
      </Sequence>
      <BusinessLabel name={props.businessName} city={props.city} />
      {props.narration.map((clip) => (
        <Sequence key={`${clip.from}`} from={clip.from} durationInFrames={clip.durationInFrames}>
          <Audio src={clip.src} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
