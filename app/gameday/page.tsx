import type { Metadata } from "next"
import { GameDayHero } from "@/components/gameday/hero"
import { BseLocker } from "@/components/gameday/locker"
import { GrandPrize } from "@/components/gameday/grand-prize"
import { SupplySection } from "@/components/gameday/supply-section"
import { HowItWorks } from "@/components/gameday/how-it-works"
import { FreeEntry } from "@/components/gameday/free-entry"
import { PickemTeaser } from "@/components/gameday/pickem-teaser"
import { Winners } from "@/components/gameday/winners"
import { BackToBoard } from "@/components/gameday/back-to-board"
import { PrototypeNotice } from "@/components/gameday/prototype-notice"

export const metadata: Metadata = {
  title: "Game Day — Big Spread Energy",
  description:
    "BSE Game Day prototype: the future home of BSE giveaways, BSE Supply promotions and Saturday Pick'em. No promotion is currently active.",
}

export default function GameDayPage() {
  return (
    <main className="overflow-x-clip">
      <GameDayHero />
      <BseLocker />
      <GrandPrize />
      <SupplySection />
      <HowItWorks />
      <FreeEntry />
      <PickemTeaser />
      <Winners />
      <BackToBoard />
      <PrototypeNotice />
    </main>
  )
}
