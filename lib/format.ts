export function timeAgo(at: number, now: number) {
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return `${Math.max(1, s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fullTime(at: number) {
  const d = new Date(at);
  return `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

export function compact(n: number) {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function sol(n: number, digits?: number) {
  const d = digits ?? (Math.abs(n) >= 100 ? 1 : Math.abs(n) >= 1 ? 2 : Math.abs(n) >= 0.1 ? 2 : 3);
  return n.toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function signedSol(n: number) {
  return `${n >= 0 ? '+' : '−'}${sol(Math.abs(n))}`;
}

export function mcap(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

export function short(addr: string, a = 4, b = 4) {
  return addr.length <= a + b + 1 ? addr : `${addr.slice(0, a)}…${addr.slice(-b)}`;
}

export function joinedDate(at: number) {
  return new Date(at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
