import { Hero } from '@/components/home/hero'
import { LiveTicker } from '@/components/home/live-ticker'
import { TopEdges } from '@/components/home/top-edges'
import { FeatureGrid } from '@/components/home/feature-grid'
import { ResultsBand } from '@/components/home/results-band'
import { HomeCta } from '@/components/home/cta'

export default function Page() {
  return (
    <main>
      <Hero />
      <LiveTicker />
      <TopEdges />
      <FeatureGrid />
      <ResultsBand />
      <HomeCta />
    </main>
  )
}
