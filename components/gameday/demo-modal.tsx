"use client"

import { useId, useRef, type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

type DemoModalProps = {
  triggerLabel: ReactNode
  triggerClassName?: string
  title: string
  children: ReactNode
}

export function DemoModal({ triggerLabel, triggerClassName, title, children }: DemoModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 font-display text-base font-semibold uppercase tracking-wide text-primary transition hover:brightness-125",
          triggerClassName,
        )}
      >
        {triggerLabel}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close()
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-primary/30 bg-card p-0 text-card-foreground shadow-[0_0_80px_-20px_var(--primary)] backdrop:bg-background/80 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-display text-2xl font-bold uppercase leading-tight text-balance">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="-mr-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  )
}
