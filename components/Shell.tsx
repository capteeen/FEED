'use client';
import { LeftNav, MobileTabBar, MobileTipFab } from './Nav';
import { RightRail } from './RightRail';
import { Modals } from './Modals';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="flex min-h-screen justify-center">
        <header className="hidden shrink-0 sm:flex sm:justify-end">
          <LeftNav />
        </header>
        <main className="min-h-screen w-full min-w-0 max-w-feed border-border pb-[60px] sm:border-x sm:pb-0">{children}</main>
        <aside className="ml-[30px] mr-2.5 hidden w-[290px] shrink-0 lg:block xl:w-rail">
          <RightRail />
        </aside>
      </div>
      <MobileTabBar />
      <MobileTipFab />
      <Modals />
    </>
  );
}
