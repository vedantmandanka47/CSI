import React from 'react';
import { faqItems } from '@/content/faq';

export function FaqSection() {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {faqItems.map((item) => (
        <details
          key={item.id}
          className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40 [&_summary::-webkit-details-marker]:hidden"
        >
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-text select-none">
            <span>{item.question}</span>
            <span className="ml-4 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-xs text-text-muted transition-transform group-open:rotate-180">
              ↓
            </span>
          </summary>
          <div className="mt-3 border-t border-border/50 pt-3 text-xs leading-relaxed text-text-muted">
            <p>{item.answer}</p>
            <span className="mt-2 inline-block rounded bg-surface-raised px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-muted">
              {item.category}
            </span>
          </div>
        </details>
      ))}
    </div>
  );
}

