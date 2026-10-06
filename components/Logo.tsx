export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-label="FEED">
      <path d="M16 2l12.1 7v14L16 30 3.9 23V9z" fill="currentColor" />
      <path d="M11 10h10v3h-6.6v2.4h5.6v3h-5.6V23H11z" fill="rgb(var(--bg))" />
    </svg>
  );
}
