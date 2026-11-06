type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const External = ({ className }: P) => (
  <svg {...base} className={className}><path d="M7 17 17 7" /><path d="M9 7h8v8" /></svg>
);
export const ArrowRight = ({ className }: P) => (
  <svg {...base} className={className}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
);
