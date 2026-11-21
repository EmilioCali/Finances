import { AppShell } from "@/components/app-shell"

export default function ImportPage() {
  return (
    <AppShell>
      <header className="mx-auto w-full max-w-6xl px-6 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Importar</h1>
        <p className="text-sm text-muted-foreground">
          La carga de CSV llega en la siguiente pantalla. El consolidado de
          enero ya está en el dashboard.
        </p>
      </header>
    </AppShell>
  )
}
