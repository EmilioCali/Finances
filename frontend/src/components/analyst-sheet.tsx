"use client"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export function AnalystSheet() {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="outline" className="h-9 rounded-full px-4" />}
      >
        Analista
      </SheetTrigger>
      <SheetContent className="w-full border-border sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Analista</SheetTitle>
          <SheetDescription>
            Las cifras salen del motor. Este panel todavía no llama a la API.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          <p className="rounded-xl bg-muted px-3 py-2 text-sm">
            ¿Qué pasa si el quetzal se deprecia un 10 % y los costos de
            Guatemala suben un 8 %?
          </p>
          <p className="rounded-xl border border-border px-3 py-2 text-sm leading-6">
            El resultado operativo pasa de 15,000.00 USD a 14,181.82 USD.
            Empresa A es la más afectada.
          </p>
        </div>
        <form className="border-t border-border p-4">
          <label className="sr-only" htmlFor="analyst-draft">
            Pregunta
          </label>
          <input
            id="analyst-draft"
            disabled
            placeholder="El agente se conecta cuando exista el backend"
            className="h-11 w-full rounded-xl border border-border bg-input px-3 text-sm text-muted-foreground"
          />
        </form>
      </SheetContent>
    </Sheet>
  )
}
