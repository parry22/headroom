/** The four views of the dashboard. The top bar and the link audit read this list. */
export const PAGES = [
  { href: "/", label: "Overview" },
  { href: "/memory", label: "Memory proof" },
  { href: "/payments", label: "Payments" },
  { href: "/pricing", label: "Pricing" },
] as const;
