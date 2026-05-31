'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../ui/Accordion';

const FAQ_ITEMS = [
  {
    id: 'what',
    question: 'What is a top-up?',
    answer:
      'Lock your USDC or GHO on Base for 30 days to stake it. Your USDC stake increases your daily run allowance.',
  },
  {
    id: 'claim',
    question: 'When can I claim?',
    answer:
      'Once the unlock date arrives you can submit an on-chain transaction to withdraw your funds.',
  },
  {
    id: 'fees',
    question: 'Are there fees?',
    answer:
      'Gas fees apply on every on-chain action. Additional protocol fees will appear here once they are confirmed.',
  },
  {
    id: 'networks',
    question: 'Which networks are supported?',
    answer:
      'Top-ups currently target the Base network. We display prompts to help you switch to the correct network inside the wallet flow.',
  },
];

export function TopupFaq() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">FAQ</h2>
        <p className="text-sm text-muted-foreground">
          Tap a question to learn how top-ups work today.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {FAQ_ITEMS.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
