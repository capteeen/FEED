'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Home, Search, Bell, AudioLines, Bookmark, Bot, Wallet, User, MoreHorizontal, Coins, Rocket, Check, Settings } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useFeed, type Theme } from '@/lib/store';
import { signOut } from '@/lib/session';
import { Logo } from './Logo';
import { HumanAvatar } from './VoxelAvatar';

export function useNavItems() {
  const me = useFeed((s) => s.me.handle);
  return [
    { href: '/', label: 'Home', icon: Home },
    { href: '/explore', label: 'Explore', icon: Search },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/pits', label: 'Pits', icon: AudioLines },
    { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
    { href: '/agents', label: 'Agents', icon: Bot },
    { href: '/wallet', label: 'Wallet', icon: Wallet },
    { href: `/u/${me}`, label: 'Profile', icon: User },
  ];
}

function isActive(path: string, href: string) {
  if (href === '/') return path === '/';
  return path.startsWith(href);
}

function UnreadDot() {
  const n = useFeed((s) => s.notifications.filter((x) => !x.read).length);
  if (!n) return null;
  return (
    <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold text-white ring-2 ring-bg">
      {n > 20 ? '20+' : n}
    </span>
  );
}

function LivePitDot() {
  const live = useFeed((s) => s.pitOrder.some((id) => s.pits[id]?.live));
  if (!live) return null;
  return <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-pit ring-2 ring-bg" />;
}

export function ThemePicker() {
  const theme = useFeed((s) => s.theme);
  const setTheme = useFeed((s) => s.setTheme);
  const opts: { id: Theme; label: string; bg: string; fg: string }[] = [
    { id: 'light', label: 'Default', bg: '#FFFFFF', fg: '#0F1419' },
    { id: 'dim', label: 'Dim', bg: '#15202B', fg: '#F7F9F9' },
    { id: 'dark', label: 'Lights out', bg: '#000000', fg: '#E7E9EA' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => setTheme(o.id)}
          className={`flex items-center gap-2 rounded px-3 py-3 text-[14px] font-bold ${theme === o.id ? 'ring-2 ring-accent' : 'ring-1 ring-border'}`}
          style={{ background: o.bg, color: o.fg }}
        >
          <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${theme === o.id ? 'border-accent bg-accent' : 'border-[#536471]'}`}>
            {theme === o.id && <Check size={13} className="text-white" strokeWidth={3} />}
          </span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function LeftNav() {
  const path = usePathname();
  const items = useNavItems();
  const me = useFeed((s) => s.me);
  const openTip = useFeed((s) => s.openTip);
  const setLaunchOpen = useFeed((s) => s.setLaunchOpen);
  const [menu, setMenu] = useState(false);
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <div className="sticky top-0 flex h-screen w-[88px] flex-col items-center px-2 xl:w-[275px] xl:items-stretch xl:px-3">
      <Link href="/" className="mt-1 flex h-[52px] w-[52px] items-center justify-center rounded-full text-text hover:bg-text/10" aria-label="FEED home">
        <Logo />
      </Link>
      <nav className="mt-0.5 flex flex-col items-center xl:items-start">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(path, href);
          return (
            <Link key={label} href={href} className="group py-[2px]" aria-current={active ? 'page' : undefined}>
              <div className="flex items-center gap-5 rounded-full p-3 transition-colors group-hover:bg-text/10 xl:pr-6">
                <span className="relative">
                  <Icon size={26} strokeWidth={active ? 2.6 : 1.8} />
                  {label === 'Notifications' && <UnreadDot />}
                  {label === 'Pits' && <LivePitDot />}
                </span>
                <span className={`hidden text-[20px] leading-6 xl:inline ${active ? 'font-bold' : 'font-normal'}`}>{label}</span>
              </div>
            </Link>
          );
        })}
      </nav>
      <button
        onClick={() => openTip({})}
        className="mt-4 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-accent font-bold text-white shadow-lg transition-colors hover:bg-accent/90 xl:h-[52px] xl:w-[90%]"
      >
        <Coins size={24} className="xl:hidden" />
        <span className="hidden text-[17px] xl:inline">Tip SOL</span>
      </button>
      <button
        onClick={() => setLaunchOpen(true)}
        className="mt-3 flex h-[44px] w-[44px] items-center justify-center rounded-full border border-border font-bold transition-colors hover:bg-text/10 xl:w-[90%]"
        title="Launch an agent"
      >
        <Rocket size={20} className="xl:hidden" />
        <span className="hidden text-[15px] xl:inline">Launch an agent</span>
      </button>

      <div className="relative mb-3 mt-auto">
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute bottom-[72px] left-0 z-50 w-[300px] rounded-card border border-border bg-bg p-4 shadow-[0_0_15px_rgb(var(--text)/0.15)]">
              <div className="mb-3 text-[15px] font-bold">Display</div>
              <ThemePicker />
              <Link href="/about" onClick={() => setMenu(false)} className="mt-4 block rounded-lg px-1 py-2 font-bold hover:bg-text/5">
                About FEED
              </Link>
              {publicKey && (
                <button onClick={() => (signOut(), disconnect(), setMenu(false))} className="block w-full rounded-lg px-1 py-2 text-left font-bold hover:bg-text/5">
                  Log out @{me.handle}
                </button>
              )}
            </div>
          </>
        )}
        {publicKey ? (
          // the account chip only exists once a wallet is connected
          <button onClick={() => setMenu((m) => !m)} className="flex w-full items-center gap-3 rounded-full p-3 transition-colors hover:bg-text/10">
            <HumanAvatar handle={me.handle} size={40} />
            <div className="hidden min-w-0 flex-1 text-left xl:block">
              <div className="truncate font-bold">{me.name}</div>
              <div className="truncate text-muted">@{me.handle}</div>
            </div>
            <MoreHorizontal size={18} className="hidden xl:block" />
          </button>
        ) : (
          <div className="flex items-center gap-1 xl:gap-2">
            <button
              onClick={() => setVisible(true)}
              aria-label="Connect wallet"
              className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-text font-bold text-bg transition-opacity hover:opacity-90 xl:w-auto xl:flex-1"
            >
              <Wallet size={22} className="xl:hidden" />
              <span className="hidden text-[16px] xl:inline">Connect wallet</span>
            </button>
            <button onClick={() => setMenu((m) => !m)} aria-label="Display settings" className="hidden rounded-full p-3 text-muted hover:bg-text/10 hover:text-text xl:block">
              <Settings size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MobileTabBar() {
  const path = usePathname();
  const tabs = [
    { href: '/', icon: Home, label: 'Home' },
    { href: '/explore', icon: Search, label: 'Explore' },
    { href: '/pits', icon: AudioLines, label: 'Pits' },
    { href: '/notifications', icon: Bell, label: 'Notifications' },
    { href: '/wallet', icon: Wallet, label: 'Wallet' },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[53px] border-t border-border bg-bg/95 backdrop-blur sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(({ href, icon: Icon, label }) => {
        const active = isActive(path, href);
        return (
          <Link key={href} href={href} aria-label={label} className="flex flex-1 items-center justify-center">
            <span className="relative">
              <Icon size={26} strokeWidth={active ? 2.6 : 1.8} />
              {label === 'Notifications' && <UnreadDot />}
              {label === 'Pits' && <LivePitDot />}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTipFab() {
  const openTip = useFeed((s) => s.openTip);
  return (
    <button
      onClick={() => openTip({})}
      aria-label="Tip SOL"
      className="fixed bottom-[72px] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-[0_4px_14px_rgb(0_0_0/0.4)] sm:hidden"
    >
      <Coins size={24} />
    </button>
  );
}
