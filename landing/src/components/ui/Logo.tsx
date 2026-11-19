import { Link } from 'react-router';

import { cn } from '@/lib/utils';
import { TroupeMark } from './Icons';

type LogoProps = {
  className?: string;
  /** Mark size in px. */
  size?: number;
};

export function Logo({ className, size = 20 }: LogoProps) {
  return (
    <Link
      to="/"
      aria-label="Troupe home"
      // 11px padding above and below, cancelled by the same negative margin: a 44px hit area, same layout.
      className={cn('-my-[11px] flex items-center gap-2 rounded-md py-[11px] text-foreground', className)}
    >
      <TroupeMark size={size} />
      <span className="text-[16px] leading-[22px] font-semibold tracking-[-0.01em]">Troupe</span>
    </Link>
  );
}
