/**
 * Headroom's mark: three memory tiers (HBM, DRAM, NVMe) as stacked slabs, with the top slab lifted to leave headroom
 * and lit in the brand gradient. Fills use the shared gradients defined once in the root layout.
 */
export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="img" aria-label="Headroom">
      <rect x="3" y="17" width="18" height="4.5" rx="2.25" fill="#3a3a3e" />
      <rect x="3" y="11.5" width="18" height="4.5" rx="2.25" fill="#55555c" />
      <ellipse cx="12" cy="9.2" rx="7" ry="1.1" fill="#fbb39c" opacity="0.45" filter="url(#hr-blur)" />
      <rect x="3" y="2.5" width="18" height="5.5" rx="2.75" fill="url(#hr-fill)" />
      <rect x="3" y="2.5" width="18" height="5.5" rx="2.75" fill="url(#hr-shade)" />
      <rect x="6" y="3.6" width="7" height="1.2" rx="0.6" fill="#fff" opacity="0.55" />
    </svg>
  );
}
