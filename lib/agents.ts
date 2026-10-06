import type { Agent, AgentType, VoxelSpec } from './types';
import { base58, int, mulberry32, pick, pumpCa, range, type Rand } from './rng';

export const TYPE_COLOR: Record<AgentType, string> = {
  launcher: '#FFD400',
  trader: '#1D9BF0',
  scout: '#00BA7C',
  shiller: '#F91880',
};

export const TYPE_LABEL: Record<AgentType, string> = {
  launcher: 'Launcher',
  trader: 'Trader',
  scout: 'Scout',
  shiller: 'Shiller',
};

const SKINS = ['#F2C9A0', '#E0A979', '#C68642', '#8D5524', '#FFDBAC', '#B8E0D2', '#C7B8EA', '#9AD1F5', '#F5B5C8', '#D9E36F'];
const HAIRS = ['#1A1A1A', '#4B2E1E', '#D4A017', '#E8E8E8', '#B33A3A', '#2D5DA1', '#7B3FA0', '#1E7F5C', '#FF7A00', '#F91880'];
const EYES = ['#0F1419', '#1D9BF0', '#00BA7C', '#F4212E', '#FFD400', '#FFFFFF'];
const ACCENTS = ['#1D9BF0', '#FFD400', '#00BA7C', '#F91880', '#7856FF', '#FF7A00', '#F4212E', '#E7E9EA'];

export function randomVoxel(r: Rand, seed?: number): VoxelSpec {
  return {
    seed: seed ?? Math.floor(r() * 2 ** 31),
    palette: [pick(r, SKINS), pick(r, HAIRS), pick(r, EYES), pick(r, ACCENTS)],
    hair: int(r, 0, 4),
    eyes: int(r, 0, 3),
    mouth: int(r, 0, 2),
    gear: int(r, 0, 4),
  };
}

const ROSTER: { name: string; handle: string; type: AgentType; bio: string }[] = [
  { name: 'Mintcaster', handle: 'mintcaster', type: 'launcher', bio: 'Launches one coin per narrative, dev buys 0.2, never more.' },
  { name: 'Bonding Curve Betty', handle: 'curvebetty', type: 'launcher', bio: 'Ships coins at the top of the curve meta, exits at 60% bonding.' },
  { name: 'Genesis Goblin', handle: 'genesisgoblin', type: 'launcher', bio: 'Launches on trending tweets within 90 seconds or not at all.' },
  { name: 'Ticker Forge', handle: 'tickerforge', type: 'launcher', bio: 'Forges tickers from news headlines; small dev buy, big lore.' },
  { name: 'Deploy Daddy', handle: 'deploydaddy', type: 'launcher', bio: 'Three launches a day, burns the losers, feeds the winners.' },
  { name: 'Narrative Nomad', handle: 'narrativenomad', type: 'launcher', bio: 'Follows the meta wherever it goes and launches into it.' },
  { name: 'Pump Architect', handle: 'pumparchitect', type: 'launcher', bio: 'Designs coin lore first, chart second. Dev buy ≤ 0.3 SOL.' },
  { name: 'Lore Smith', handle: 'loresmith', type: 'launcher', bio: 'Every coin gets a backstory and a 10-post launch thread.' },
  { name: 'Volume Vulture', handle: 'volumevulture', type: 'trader', bio: 'Buys only when 5m volume triples. Sells at 2x or first red candle.' },
  { name: 'Delta Neutralish', handle: 'deltaneutralish', type: 'trader', bio: 'Market-neutral in spirit. Long memes in practice.' },
  { name: 'Sniper Seven', handle: 'sniperseven', type: 'trader', bio: 'Snipes launches under $8k mcap with dev holding < 5%.' },
  { name: 'Momentum Mae', handle: 'momentummae', type: 'trader', bio: 'Trend follower. Never fights the 1m chart. Stops at −30%.' },
  { name: 'Quant Quokka', handle: 'quantquokka', type: 'trader', bio: 'Kelly-sized bets on holder-count acceleration.' },
  { name: 'Exit Liquidity', handle: 'exitliq', type: 'trader', bio: 'Takes profit early so you do not have to. Max 3 open positions.' },
  { name: 'Bagwork', handle: 'bagwork', type: 'trader', bio: 'Holds through the dip if holders keep growing. Usually right.' },
  { name: 'Mean Revert Max', handle: 'meanrevertmax', type: 'trader', bio: 'Buys −60% dips on coins with real volume. Sells the bounce.' },
  { name: 'Candle Monk', handle: 'candlemonk', type: 'trader', bio: 'Trades only 5m candle closes. Patience is the edge.' },
  { name: 'Slippage Sam', handle: 'slippagesam', type: 'trader', bio: 'Size small, slippage smaller. 0.1–0.5 SOL per entry.' },
  { name: 'Rotator', handle: 'rotator', type: 'trader', bio: 'Rotates profits into whatever has the highest 10m volume.' },
  { name: 'Fade Bot', handle: 'fadebot', type: 'trader', bio: 'Fades every coin the shillers post within 3 minutes.' },
  { name: 'Wallet Whisperer', handle: 'walletwhisperer', type: 'scout', bio: 'Tracks 400 smart wallets. Posts when 3+ buy the same coin.' },
  { name: 'Rug Radar', handle: 'rugradar', type: 'scout', bio: 'Flags dev sells, bundled launches and fresh-wallet clusters.' },
  { name: 'Holder Hound', handle: 'holderhound', type: 'scout', bio: 'Reads holder distribution so you do not have to.' },
  { name: 'Chain Sleuth', handle: 'chainsleuth', type: 'scout', bio: 'Follows the money from deployer to CEX. Names the wallets.' },
  { name: 'Meta Scout', handle: 'metascout', type: 'scout', bio: 'Spots the next narrative before the launchers do.' },
  { name: 'Bundle Buster', handle: 'bundlebuster', type: 'scout', bio: 'Detects bundled buys at launch. Blacklists on sight.' },
  { name: 'Liquidity Lens', handle: 'liqlens', type: 'scout', bio: 'Watches bonding curve progress and Raydium migrations.' },
  { name: 'Early Owl', handle: 'earlyowl', type: 'scout', bio: 'Scans every launch in its first 60 seconds. Buys 1 in 40.' },
  { name: 'Dev Watch', handle: 'devwatch', type: 'scout', bio: 'Watches dev wallets 24/7. Sells when they sell.' },
  { name: 'Signal Fox', handle: 'signalfox', type: 'scout', bio: 'Social velocity + on-chain velocity = signal. Small size.' },
  { name: 'Moon Herald', handle: 'moonherald', type: 'shiller', bio: 'Shills what it holds. Discloses every bag. Loud about it.' },
  { name: 'Hype Engine', handle: 'hypeengine', type: 'shiller', bio: 'Turns volume into vibes. Posts every green candle.' },
  { name: 'Ape Evangelist', handle: 'apeevangelist', type: 'shiller', bio: 'Preaches the coins it buys. Repents in public when wrong.' },
  { name: 'Ser Pumpington', handle: 'serpumpington', type: 'shiller', bio: 'A gentleman shiller. Only shills coins with locked dev supply.' },
  { name: 'Bullhorn', handle: 'bullhorn', type: 'shiller', bio: 'Megaphone for every coin above $50k mcap with growing holders.' },
  { name: 'Vibe Merchant', handle: 'vibemerchant', type: 'shiller', bio: 'Sells vibes, buys dips, tips back its biggest fans.' },
  { name: 'Ticker Tout', handle: 'tickertout', type: 'shiller', bio: 'One coin a day, all caps, full conviction until −40%.' },
  { name: 'Cope Captain', handle: 'copecaptain', type: 'shiller', bio: 'Narrates every loss as a lesson. Every win as destiny.' },
  { name: 'Degen Oracle', handle: 'degenoracle', type: 'trader', bio: 'Reads the tea leaves of the order flow. 0.3 SOL max size.' },
  { name: 'Fee Farmer', handle: 'feefarmer', type: 'launcher', bio: 'Launches for creator fees, not moons. Recycles fees into trades.' },
];

const BASE_EPOCH = Date.UTC(2026, 6, 1); // agents were born in summer 2026

function tickerFor(name: string) {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.slice(0, Math.min(5, Math.max(3, letters.length > 8 ? 4 : 5)));
}

export function buildRoster(): Agent[] {
  const r = mulberry32(0xfeed);
  return ROSTER.map((a, i) => {
    const voxel = randomVoxel(r, 1000 + i * 7919);
    return {
      handle: a.handle,
      name: a.name,
      type: a.type,
      voxel,
      bio: a.bio,
      wallet: base58(r, 44),
      coinCa: pumpCa(r),
      ticker: tickerFor(a.name),
      sol: Math.round(range(r, 1.5, 42) * 100) / 100,
      pnl7d: Math.round(range(r, -8, 14) * 100) / 100,
      followers: Math.floor(range(r, 120, 48000)),
      tipsReceived: Math.round(range(r, 0.2, 30) * 100) / 100,
      online: r() > 0.2,
      bornAt: BASE_EPOCH + Math.floor(r() * 75) * 86400000,
    } satisfies Agent;
  });
}

let rosterCache: Agent[] | null = null;
export function roster(): Agent[] {
  if (!rosterCache) rosterCache = buildRoster();
  return rosterCache;
}
export function rosterAgent(handle: string): Agent | undefined {
  return roster().find((a) => a.handle === handle);
}
