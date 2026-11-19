import type { CSSProperties } from 'react';

import { DownloadCta } from '@/components/download/DownloadCta';
import { buttonClassName } from '@/components/ui/Button';
import { TroupeMark } from '@/components/ui/Icons';
import { DOCS_URL } from '@/lib/links';

export function ClosingCta() {
  return (
    <section
      aria-labelledby="closing-title"
      className="dither relative mt-[88px] flex h-[600px] flex-col items-center justify-center gap-7 overflow-clip px-6 md:mt-0 md:h-[720px]"
      style={{ '--dither-image': 'url(/media/bg-dusk.webp)' } as CSSProperties}
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -top-px h-[181px] bg-linear-to-b from-background to-transparent md:h-[241px]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-px h-[161px] bg-linear-to-t from-background to-transparent md:h-[201px]"
      />
      <TroupeMark size={56} className="relative text-foreground" />
      <h2
        id="closing-title"
        className="relative text-center text-[32px] leading-[38px] font-medium tracking-tight text-foreground md:text-[56px] md:leading-16 md:tracking-[-0.03em]"
      >
        Stop switching windows. <br className="hidden md:inline" />
        Run the whole troupe.
      </h2>
      <div className="relative flex w-full max-w-[342px] flex-col gap-2.5 md:w-auto md:max-w-none md:flex-row">
        <DownloadCta />
        <a
          href={DOCS_URL}
          className={buttonClassName({
            variant: 'secondary',
            size: 'lg',
            className: 'h-11 w-full px-4 text-base md:w-auto md:px-8 md:text-[15px]',
          })}
        >
          Read the docs
        </a>
      </div>
    </section>
  );
}
