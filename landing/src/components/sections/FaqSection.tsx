import * as Faq from '@/components/ui/Faq';
import { FAQ } from '@/data/faq';
import { Container } from './Container';

export function FaqSection() {
  return (
    <section aria-labelledby="faq-title">
      <Container className="flex flex-col gap-5 pt-[88px] pb-24 md:flex-row md:items-start md:justify-between md:gap-10 md:pt-40 md:pb-40">
        <h2
          id="faq-title"
          className="text-[28px] leading-[34px] font-medium tracking-[-0.02em] text-foreground md:w-[320px] md:shrink-0 md:text-2xl md:leading-8"
        >
          Frequently asked <br className="hidden md:inline" />
          questions
        </h2>
        <Faq.Root defaultValue={['what']} className="w-full md:max-w-[760px]">
          {FAQ.map((item) => (
            <Faq.Item key={item.id} value={item.id}>
              <Faq.Question>{item.question}</Faq.Question>
              <Faq.Answer>{item.answer}</Faq.Answer>
            </Faq.Item>
          ))}
        </Faq.Root>
      </Container>
    </section>
  );
}
