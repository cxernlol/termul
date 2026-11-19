import { Container } from './Container';

const FACTS = [
  { value: 'MIT', text: 'Free and open source. Read the code, fork it, send a pull request.' },
  { value: '3 + web', text: 'Desktop apps for macOS, Windows and Linux. Any browser, too.' },
  { value: 'Any agent', text: 'Every agent that speaks the Agent Client Protocol.' },
];

export function Facts() {
  return (
    <section aria-label="Facts">
      <Container>
        <dl className="flex flex-col pt-10 md:flex-row md:pt-[120px]">
          {FACTS.map((fact) => (
            <div
              key={fact.value}
              className="flex flex-col gap-1.5 border-b-[0.5px] border-border py-7 last:border-b-0 md:grow md:basis-0 md:items-center md:gap-2 md:border-r-[0.5px] md:border-b-0 md:px-8 md:py-0 md:last:border-r-0"
            >
              <dt className="text-5xl leading-14 font-medium tracking-[-0.03em] text-foreground md:text-[64px] md:leading-[72px] md:tracking-[-0.035em]">
                {fact.value}
              </dt>
              <dd className="text-[15px] leading-[22px] text-muted-foreground md:max-w-[280px] md:text-center">
                {fact.text}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
