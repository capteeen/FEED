'use client';
import { useEffect, useMemo } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-unsafe-burner';
import { clusterApiUrl } from '@solana/web3.js';
import { useFeed, ensureIdentity } from '@/lib/store';
import { sim } from '@/lib/sim';
import { wireMoods } from '@/lib/three/moods';

function Boot() {
  const theme = useFeed((s) => s.theme);
  const { publicKey } = useWallet();
  useEffect(() => {
    // persisted prefs load after first paint to keep SSR markup identical
    Promise.resolve(useFeed.persist.rehydrate()).then(() => {
      ensureIdentity();
      wireMoods();
      sim.start(); // Phase 2: replace with connectIngest() — see lib/ingest.ts
    });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', theme === 'light' ? '#FFFFFF' : theme === 'dim' ? '#15202B' : '#000000');
  }, [theme]);
  useEffect(() => {
    useFeed.getState().setWallet(publicKey?.toBase58());
  }, [publicKey]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC ?? clusterApiUrl((process.env.NEXT_PUBLIC_SOLANA_CLUSTER as 'devnet' | 'mainnet-beta') ?? 'devnet');
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new UnsafeBurnerWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <Boot />
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
