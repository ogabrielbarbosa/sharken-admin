import { Composition } from 'remotion';
import { ProposalVideo, type ProposalVideoProps } from './ProposalVideo';

const defaults: ProposalVideoProps = {
  narration: [],
  durationInFrames: 30,
  pageScrollSrc: '',
  businessName: 'Negócio',
  city: 'Cidade',
};

export function Root() {
  return (
    <Composition
      id="ProposalVideo"
      component={ProposalVideo}
      width={1280}
      height={720}
      fps={30}
      durationInFrames={30}
      defaultProps={defaults}
      calculateMetadata={({ props }: { props: ProposalVideoProps }) => ({ durationInFrames: props.durationInFrames })}
    />
  );
}
