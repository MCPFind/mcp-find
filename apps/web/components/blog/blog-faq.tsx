"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { IconChevronDown } from "@tabler/icons-react";

interface FaqItem {
  question: string;
  answer: string;
}

function FaqAccordionItem({ question, answer }: FaqItem) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-neutral-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-base sm:text-lg font-medium text-neutral-200 group-hover:text-neutral-100 transition-colors pr-4">
          {question}
        </span>
        <IconChevronDown
          size={16}
          className={cn(
            "text-neutral-500 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-200",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <p className="pb-5 text-sm text-neutral-400 leading-relaxed">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function BlogFaq({ faqItems }: { faqItems: FaqItem[] }) {
  if (!faqItems.length) return null;

  return (
    <section className="mt-12 border-t border-neutral-800 pt-10">
      <h2 className="text-xl font-bold text-white mb-6">
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
