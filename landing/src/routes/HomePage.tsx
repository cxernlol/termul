import { Bento } from '../components/sections/Bento';
import { ClosingCta } from '../components/sections/ClosingCta';
import { Facts } from '../components/sections/Facts';
import { FaqSection } from '../components/sections/FaqSection';
import { Hero } from '../components/sections/Hero';
import { HeroShot } from '../components/sections/HeroShot';
import { MoreInOnePlace } from '../components/sections/MoreInOnePlace';
import { Testimonials } from '../components/sections/Testimonials';
import { WorksWith } from '../components/sections/WorksWith';
import { FeatureTour } from '../components/tour/FeatureTour';
import { TOUR_TABS } from '../data/tour';
import { usePageMeta } from '../lib/page-meta';

export function HomePage() {
  usePageMeta({
    title: 'Troupe — Any Agents in One UI',
    description:
      'Run every coding agent from one desktop app. Plan, review and ship with Claude Code, Codex, Gemini CLI and more, from your desk or phone. Free and open source for macOS, Windows and Linux.',
    path: '/',
  });

  return (
    <main id="main-content">
      <Hero />
      <HeroShot />
      <WorksWith />
      <FeatureTour tabs={TOUR_TABS} />
      <Bento />
      <MoreInOnePlace />
      <ClosingCta />
      <Facts />
      <Testimonials />
      <FaqSection />
    </main>
  );
}
