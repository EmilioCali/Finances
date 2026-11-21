export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M6 28h40"
        stroke="#FAFAFA"
        strokeOpacity="0.55"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M6 24L46 10"
        stroke="#B1D86D"
        strokeOpacity="0.7"
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="text-sm font-semibold tracking-tight">
      <span className="text-foreground/55">Scenario</span>
      <span className="text-primary/70">Lab</span>
    </span>
  )
}
