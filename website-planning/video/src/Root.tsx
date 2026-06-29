import { Composition } from 'remotion';
import { loadFont as loadJakarta } from '@remotion/google-fonts/PlusJakartaSans';
import { loadFont as loadFira } from '@remotion/google-fonts/FiraCode';
import { HeroDemo } from './HeroDemo';
import { FPS, W, H, TOTAL } from './timing';

// 폰트 로드 — 라틴 서브셋 + 실제 사용 weight만(네트워크 요청·번들 최소화).
// 본문 400/500/600/700/800, mono 400/700만 쓴다.
loadJakarta('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  ignoreTooManyRequestsWarning: true,
});
loadFira('normal', {
  weights: ['400', '700'],
  subsets: ['latin'],
  ignoreTooManyRequestsWarning: true,
});

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="HeroDemo"
      component={HeroDemo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={W}
      height={H}
    />
  );
};
