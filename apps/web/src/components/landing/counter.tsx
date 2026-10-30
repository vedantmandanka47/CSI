'use client';

import React from 'react';

interface MetricItem {
  label: string;
  value: number;
  suffix?: string;
  description: string;
}

interface CounterProps {
  metrics: MetricItem[];
}

export function Counter({ metrics }: CounterProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {metrics.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-surface p-5 text-center shadow-sm"
        >
          <div className="font-display text-3xl font-bold tracking-tight text-text">
            {item.value}
            {item.suffix}
          </div>
          <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-primary">
            {item.label}
          </div>
          <div className="mt-1 text-xs text-text-muted">{item.description}</div>
        </div>
      ))}
    </div>
  );
}

