import { cn } from '@/lib/utils';
import type { IllustrationProps } from './types';
import './illustrations.css';

/**
 * Skills and slash commands card illustration (Paper: "Illustration · Skills", 252×200).
 * The viewBox is 512×512, shown with object-fit: contain.
 * The top card with the "/" lifts off the stack. The dashed guides show how far it rose.
 * The still frame (paused or reduced motion) shows the card fully raised.
 */
export function SkillsIllustration({ className, playing = false }: IllustrationProps) {
  return (
    <svg
      width="252"
      height="200"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      data-playing={playing ? 'true' : 'false'}
      className={cn('ill-root', className)}
    >
      {/* Stack: cards below the top card */}
      <path d="m149.9 226.6-75.78 43.97c-2.624 1.472-2.752 4.8-0.192 6.272l146.1 84.16c4.16 2.304 9.472 2.304 13.44 0l203.7-114.7c2.816-1.6 2.816-5.376 0-6.912l-81.73-47.87" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m92.1 287.6-20.8 12.29c-3.328 2.048-3.328 6.912 0 8.96l147.5 85.89c4.16 2.368 9.536 2.368 13.44 0l207.5-117.2c3.136-1.92 3.136-6.016 0-7.744l-21.7-13.31" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m90.5 320.7-19.2 11.2c-3.392 2.048-3.2 6.912 0.256 9.152l147.2 86.08c4.096 2.304 9.664 2.304 13.63 0l207.1-117.3c3.328-2.048 3.328-6.464 0-8.256l-20.86-12.48" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m90.37 352.4-19.07 11.14c-3.52 2.176-3.2 7.04 0.448 9.344l147 85.82c3.968 2.368 9.536 2.368 13.44 0l207-117.1c3.584-2.24 3.456-6.72 0-8.512l-20.22-11.97" fill="none" stroke="#75787B" strokeWidth="1.014" />

      {/* Top card: outline, "/" and text lines move as one group */}
      <g className="ill-anim ill-skills-card">
        <path d="m284.5 28.86-227 133.4c-3.776 2.24-3.776 7.552 0 9.6l158.9 93.5c4.032 2.432 9.28 2.432 13.25 0l224.2-131.8c4.224-2.496 4.224-8 0-10.24l-156.3-94.08c-4.096-2.496-9.024-2.496-13.06-0.384z" fill="none" stroke="#75787B" strokeWidth="1.014" />
        <path className="ill-anim ill-skills-slash" d="m316.8 86.08-63.23 99.07 18.88-0.256 62.78-99.2-18.43 0.384z" fill="none" stroke="#75787B" strokeWidth="1.014" />
        <path d="m135.7 155.8 74.82 43.97" fill="none" stroke="#75787B" strokeWidth="1.014" />
        <path d="m122.9 164.2 62.78 36.93" fill="none" stroke="#75787B" strokeWidth="1.014" />
        <path d="m109.6 173.1 61.76 35.97" fill="none" stroke="#75787B" strokeWidth="1.014" />
      </g>

      {/* Text lines on the stack cards */}
      <path d="m143.1 263.4 66.05 38.98" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m131.6 271.3 56.58 33.22" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m120.4 279.2 55.81 32.7" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m123.1 318.7 54.78 32.45" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m122.9 351.8 54.66 31.68" fill="none" stroke="#75787B" strokeWidth="1.014" />
      <path d="m122.9 383.4 54.91 32.38" fill="none" stroke="#75787B" strokeWidth="1.014" />

      {/* Dashed guides */}
      <g className="ill-anim ill-skills-guides">
        <path d="m54.91 176.8v222.1" fill="none" stroke="#86898D" strokeWidth="0.8674" strokeLinecap="round" strokeDasharray="7.68" />
        <path d="m457.3 137.7v218.4" fill="none" stroke="#86898D" strokeWidth="0.8674" strokeLinecap="round" strokeDasharray="7.68" />
        <path d="m227.6 272.6v105.1" fill="none" stroke="#9C9EA1" strokeWidth="0.8674" strokeLinecap="round" strokeDasharray="7.68" />
        <path d="m227.6 368.1v24" fill="none" stroke="#9C9EA1" strokeWidth="0.8674" strokeLinecap="round" strokeDasharray="7.68" />
        <path d="m227.6 402.1v26.94" fill="none" stroke="#9C9EA1" strokeWidth="0.8674" strokeLinecap="round" strokeDasharray="7.68" />
        <path d="m227.7 432.3v25.28" fill="none" stroke="#9C9EA1" strokeWidth="0.8674" strokeLinecap="round" strokeDasharray="7.68" />
        <path d="m227.7 463v23.62" fill="none" stroke="#86898D" strokeWidth="0.8674" strokeLinecap="round" strokeDasharray="7.68" />
      </g>
    </svg>
  );
}
