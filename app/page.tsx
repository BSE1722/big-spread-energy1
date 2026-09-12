import { Hero } from '@/components/home/hero'
import { LiveTicker } from '@/components/home/live-ticker'
import { CommandCenter } from '@/components/home/command-center'
import { WhatBseSees } from '@/components/home/what-bse-sees'
import { GettingParlaid } from '@/components/home/getting-parlaid'
import { UnderstandBse } from '@/components/home/understand-bse'
import { Receipts } from '@/components/home/receipts'
import { HomeCta } from '@/components/home/cta'

// Homepage hierarchy: FEEL → SEE → (what BSE sees) → USE → UNDERSTAND → TRUST → JOIN.
export default function Page() {
  return (
    <main>
      <Hero />
      <LiveTicker />
      <CommandCenter />
      <WhatBseSees />
      <GettingParlaid />
      <UnderstandBse />
      <Receipts />
      <HomeCta />
    </main>
  )
}
