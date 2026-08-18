import { Hero } from "@/components/home/hero"
import { LiveTicker } from "@/components/home/live-ticker"
import { FeatureGrid } from "@/components/home/feature-grid"
import { HowItWorks } from "@/components/home/how-it-works"
import { HomeCta } from "@/components/home/cta"

export default function Page() {
  return (
    <main>
      <Hero />
      <LiveTicker />
      <FeatureGrid />
      <HowItWorks />
      <HomeCta />
    </main>
  )
}
