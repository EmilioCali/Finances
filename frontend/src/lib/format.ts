export function formatUsd(amount: string) {
  const negative = amount.startsWith("-")
  const [whole, fraction = "00"] = amount.replace("-", "").split(".")
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return `${negative ? "-" : ""}${grouped}.${fraction}`
}

export function varianceClass(amount: string) {
  if (amount.startsWith("-")) return "text-destructive"
  if (amount.startsWith("0.00")) return "text-muted-foreground"
  return "text-primary"
}
