import { mulberry32 } from '@/lib/rng';

export function seededSeries(seed: number, n = 40, start = 4000, end?: number) {
  const r = mulberry32(seed);
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    v *= 1 + (r() - 0.42) * 0.18;
    out.push(v);
  }
  if (end) {
    const k = end / out[n - 1];
    return out.map((x, i) => x * (1 + (k - 1) * (i / (n - 1))));
  }
  return out;
}

export function Sparkline({ data, width = 120, height = 36, color, fill = true, strokeWidth = 1.75 }: { data: number[]; width?: number; height?: number; color?: string; fill?: boolean; strokeWidth?: number }) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const up = data[data.length - 1] >= data[0];
  const c = color ?? (up ? 'rgb(var(--win))' : 'rgb(var(--loss))');
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const gid = `g${Math.round(data[0] * 1000) % 100000}${data.length}${up ? 1 : 0}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      {fill && (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity="0.28" />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${gid})`} />
        </>
      )}
      <path d={d} fill="none" stroke={c} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Pump.fun-style candles from a series, for the launch media card. */
export function MiniCandles({ data, width = 300, height = 110 }: { data: number[]; width?: number; height?: number }) {
  const n = Math.min(28, data.length - 1);
  const series = data.slice(-n - 1);
  const min = Math.min(...series) * 0.96, max = Math.max(...series) * 1.04;
  const y = (v: number) => height - ((v - min) / (max - min || 1)) * height;
  const bw = width / n;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {series.slice(1).map((v, i) => {
        const o = series[i];
        const up = v >= o;
        const hi = Math.max(o, v) * 1.02, lo = Math.min(o, v) * 0.98;
        const c = up ? 'rgb(var(--win))' : 'rgb(var(--loss))';
        return (
          <g key={i}>
            <line x1={i * bw + bw / 2} x2={i * bw + bw / 2} y1={y(hi)} y2={y(lo)} stroke={c} strokeWidth="1" />
            <rect x={i * bw + bw * 0.2} width={bw * 0.6} y={y(Math.max(o, v))} height={Math.max(1.5, Math.abs(y(o) - y(v)))} fill={c} rx="0.5" />
          </g>
        );
      })}
    </svg>
  );
}
