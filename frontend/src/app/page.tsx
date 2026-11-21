import Link from "next/link"
import { AnalystSheet } from "@/components/analyst-sheet"
import { AppShell } from "@/components/app-shell"
import { CompanyChart } from "@/components/dashboard/company-chart"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatUsd, varianceClass } from "@/lib/format"
import { dashboard } from "@/lib/mock-dashboard"
import { cn } from "cn"

export default function DashboardPage() {
  return (
    <AppShell>
      <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {dashboard.title}
            </h1>
            <p className="text-sm text-muted-foreground">{dashboard.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <AnalystSheet />
            <Link href="/scenarios" className={cn(buttonVariants(), "h-9 rounded-full px-4")}>
              Nuevo escenario
            </Link>
          </div>
        </header>
        <section className="grid gap-3 md:grid-cols-3">
          {[...dashboard.kpis].sort((a, b) =>
            a.label === "Resultado operativo" ? -1 : b.label === "Resultado operativo" ? 1 : 0
          ).map((kpi) => {
            const lead = kpi.label === "Resultado operativo"
            return (
              <Card
                key={kpi.label}
                className={cn(
                  "rounded-[1.75rem] bg-card ring-1 ring-white/8",
                  lead && "md:col-span-3"
                )}
              >
                <CardHeader>
                  <CardDescription className="text-[0.7rem] tracking-wide uppercase">
                    {kpi.label}
                  </CardDescription>
                  <CardTitle
                    className={cn(
                      "font-mono tabular-nums",
                      lead ? "text-4xl" : "text-2xl"
                    )}
                  >
                    {"plain" in kpi && kpi.plain
                      ? kpi.simulated
                      : formatUsd(kpi.simulated)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-xs tabular-nums text-muted-foreground">
                  {"plain" in kpi && kpi.plain ? (
                    <span>En el consolidado</span>
                  ) : (
                    <span>
                      Base {formatUsd(kpi.base)}{" "}
                      <span className={varianceClass(kpi.absolute)}>
                        {formatUsd(kpi.absolute)} ({kpi.percentage}%)
                      </span>
                    </span>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </section>

        <Card className="rounded-[1.75rem] ring-1 ring-white/8">
          <CardHeader>
            <CardTitle>Resultado por empresa</CardTitle>
            <CardDescription>
              La serie clara es el presupuesto base. La lima es el escenario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyChart />
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] ring-1 ring-white/8">
          <CardHeader>
            <CardTitle>Desglose</CardTitle>
            <CardDescription>Resultado operativo en USD.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead>Moneda</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Simulado</TableHead>
                  <TableHead className="text-right">Variación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell>{company.name}</TableCell>
                    <TableCell>{company.country}</TableCell>
                    <TableCell className="font-mono">{company.currency}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatUsd(company.base)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatUsd(company.simulated)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        varianceClass(company.absolute)
                      )}
                    >
                      {formatUsd(company.absolute)} ({company.percentage}%)
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  )
}
