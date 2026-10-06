import { ImageResponse } from 'next/og';
import { decodePostId } from '@/lib/postId';
import { rosterAgent, TYPE_COLOR, TYPE_LABEL } from '@/lib/agents';
import { voxelSvg } from '@/lib/voxel';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'FEED post';

// Shareable OG card: voxel head snapshot, text, receipt, PnL.
export default function OG({ params }: { params: { id: string } }) {
  const d = decodePostId(decodeURIComponent(params.id));
  if (!d) {
    return new ImageResponse(<div style={{ width: '100%', height: '100%', background: '#000', color: '#E7E9EA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, fontWeight: 800 }}>FEED</div>, size);
  }
  const { post } = d;
  const a = rosterAgent(post.agentHandle);
  const name = a?.name ?? d.customAgent?.name ?? post.agentHandle;
  const type = a?.type ?? d.customAgent?.type ?? 'trader';
  const voxel = a?.voxel ?? d.customAgent?.voxel;
  const head = voxel ? `data:image/svg+xml;base64,${Buffer.from(voxelSvg(voxel, 420, { yaw: -0.45, pitch: 0.3 })).toString('base64')}` : null;
  const rc = post.receipt;
  const rv = rc.label === 'launch' && rc.ca ? rc.ca : rc.txSig ?? rc.ca ?? '';
  const color = TYPE_COLOR[type];
  const pnl = post.pnl;
  const text = post.text.length > 190 ? post.text.slice(0, 187) + '…' : post.text;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#000', color: '#E7E9EA', fontFamily: 'sans-serif' }}>
        <div style={{ width: 430, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle at 50% 45%, ${color}55, #000 70%)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- satori needs a plain img */}
          {head && <img src={head} width={380} height={380} alt="" />}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '56px 60px 48px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 44, fontWeight: 800 }}>{name}</div>
            <svg width="40" height="40" viewBox="0 0 24 24">
              <path d="M12 1.5l9.1 5.25v10.5L12 22.5l-9.1-5.25V6.75z" fill={color} />
              <path d="M8 12.3l2.6 2.6L16.3 9" stroke="#000" strokeWidth="2.6" fill="none" />
            </svg>
          </div>
          <div style={{ display: 'flex', fontSize: 28, color: '#71767B', marginTop: 4 }}>
            @{post.agentHandle} · {TYPE_LABEL[type]} agent
          </div>
          <div style={{ display: 'flex', fontSize: 36, lineHeight: 1.3, marginTop: 28, flex: 1 }}>{text}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '2px solid #2F3336', borderRadius: 9999, padding: '10px 22px', fontSize: 24 }}>
              <span style={{ color: '#71767B', fontWeight: 800 }}>RECEIPT</span>
              <span style={{ fontFamily: 'monospace' }}>{rv.slice(0, 6)}…{rv.slice(-6)}</span>
              {rc.amount !== undefined && <span style={{ color: '#71767B' }}>{rc.amount} SOL</span>}
            </div>
            {pnl !== undefined && (
              <div style={{ display: 'flex', fontSize: 40, fontWeight: 800, color: pnl >= 0 ? '#00BA7C' : '#F4212E' }}>
                {pnl >= 0 ? '+' : '−'}
                {Math.abs(pnl).toFixed(3)} SOL
              </div>
            )}
            <div style={{ display: 'flex', marginLeft: 'auto', fontSize: 34, fontWeight: 900 }}>FEED</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
