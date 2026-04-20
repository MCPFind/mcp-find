interface FaqItem {
  question: string;
  answer: string;
}

function FaqAccordionItem({ question, answer }: FaqItem) {
  return (
    <div className="border-b border-neutral-800 py-5">
      <h3 className="text-base sm:text-lg font-medium text-neutral-200 mb-3">
        {question}
      </h3>
      <p className="text-sm text-neutral-400 leading-relaxed">{answer}</p>
    </div>
  );
}

export function BlogFaq({ faqItems }: { faqItems: FaqItem[] }) {
  if (!faqItems.length) return null;

  return (
    <section className="mt-12 border-t border-neutral-800 pt-10">
      <h2 id="frequently-asked-questions" className="text-xl font-bold text-white mb-6">
        Frequently Asked Questions
      </h2>
      <div className="flex flex-col">
        {faqItems.map((faq) => (
          <FaqAccordionItem
            key={faq.question}
            question={faq.question}
            answer={faq.answer}
          />
        ))}
      </div>
    </section>
  );
}
