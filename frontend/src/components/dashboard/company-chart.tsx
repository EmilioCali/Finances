"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { dashboard } from "@/lib/mock-dashboard"

const chartConfig = {
  base: { label: "Base", color: "#FAFAFA" },
  simulated: { label: "Simulado", color: "#B1D86D" },
} satisfies ChartConfig

const data = dashboard.companies.map((company) => ({
  company: company.name,
  base: company.baseChart,
  simulated: company.simulatedChart,
}))

export function CompanyChart() {
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} barGap={12} barCategoryGap="24%" maxBarSize={28}>
        <CartesianGrid vertical={false} stroke="#3F3F46" />
        <XAxis
          dataKey="company"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#A1A1AA", fontSize: 12 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "#A1A1AA", fontSize: 12 }}
          width={48}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="base" fill="var(--color-base)" radius={[14, 14, 14, 14]} />
        <Bar dataKey="simulated" fill="var(--color-simulated)" radius={[14, 14, 14, 14]} />
      </BarChart>
    </ChartContainer>
  )
}
