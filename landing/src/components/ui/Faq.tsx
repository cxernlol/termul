import type { ReactNode } from 'react';
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from '@ui-sdk/react/accordion';

import { cn } from '@/lib/utils';

/** FAQ list (UI SDK Accordion). One answer opens at a time by default. */
function Root({
  children,
  defaultValue,
  value,
  onValueChange,
  className,
}: {
  children: ReactNode;
  defaultValue?: string[];
  value?: string[];
  onValueChange?: (value: string[]) => void;
  className?: string;
}) {
  return (
    <Accordion
      defaultValue={defaultValue}
      value={value}
      onValueChange={onValueChange ? (next) => onValueChange(next as string[]) : undefined}
      hiddenUntilFound
      className={cn('flex flex-col border-t-[0.5px] border-border', className)}
    >
      {children}
    </Accordion>
  );
}

function Item({ value, children }: { value: string; children: ReactNode }) {
  return (
    <AccordionItem value={value} className="group border-b-[0.5px] border-border">
      {children}
    </AccordionItem>
  );
}

function Question({ children }: { children: ReactNode }) {
  return (
    <AccordionHeader className="m-0">
      {/* Open: 12px between question and answer (Paper), so the bottom padding shrinks with the panel. */}
      <AccordionTrigger className="flex w-full cursor-pointer items-center justify-between gap-4 py-5 text-left text-base leading-6 font-medium text-foreground transition-[padding] duration-250 ease-(--ease-out) outline-hidden focus-ring select-none group-data-open:pb-3 md:py-6 md:text-[17px] md:group-data-open:pb-3 motion-reduce:transition-none">
        <span>{children}</span>
        <span aria-hidden="true" className="relative size-6 shrink-0 text-muted-foreground">
          <span className="absolute top-1/2 left-1/2 h-[1.5px] w-3 -translate-1/2 rounded-full bg-current" />
          <span className="absolute top-1/2 left-1/2 h-3 w-[1.5px] -translate-1/2 rounded-full bg-current transition-[scale] duration-200 ease-(--ease-out) group-data-open:scale-y-0" />
        </span>
      </AccordionTrigger>
    </AccordionHeader>
  );
}

function Answer({ children }: { children: ReactNode }) {
  return (
    <AccordionPanel className="h-(--accordion-panel-height) overflow-hidden transition-[height] duration-250 ease-(--ease-out) data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
      <div className="max-w-[640px] pb-5 text-[15px] leading-6 text-muted-foreground md:pb-6 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </div>
    </AccordionPanel>
  );
}

// Compound parts. Import as a namespace: `import * as Faq from '@/components/ui/Faq'`.
export { Root, Item, Question, Answer };
