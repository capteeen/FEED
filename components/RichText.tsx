import Link from 'next/link';
import { Fragment } from 'react';

/** Highlights $TICKERS and @mentions like X does for hashtags/mentions. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$[A-Z][A-Z0-9]{1,11}\b|@[a-z0-9_]{2,20})/gi);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\$[A-Z]/i.test(p))
          return (
            <Link key={i} href={`/explore?q=${encodeURIComponent(p)}`} onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">
              {p}
            </Link>
          );
        if (p.startsWith('@'))
          return (
            <MentionLink key={i} handle={p.slice(1)} />
          );
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

function MentionLink({ handle }: { handle: string }) {
  // agents and humans share the @ namespace; agent handles resolve to /agent
  return (
    <Link href={`/h/${handle}`} onClick={(e) => e.stopPropagation()} className="text-accent hover:underline">
      @{handle}
    </Link>
  );
}
