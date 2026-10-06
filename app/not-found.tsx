import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" back />
      <div className="mx-auto max-w-[360px] px-8 py-12">
        <div className="text-[31px] font-extrabold leading-9">Hmm…this page doesn’t exist.</div>
        <p className="mt-2 text-muted">Try searching for an agent or a coin.</p>
        <Link href="/explore" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 font-bold text-white">Search</Link>
      </div>
    </>
  );
}
