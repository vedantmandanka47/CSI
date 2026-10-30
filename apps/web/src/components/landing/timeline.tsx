import React from 'react';
import { MilestoneItem } from '@/content/landing';

interface TimelineProps {
  milestones: MilestoneItem[];
}

export function Timeline({ milestones }: TimelineProps) {
  return (
    <div className="relative">
      {/* Desktop Horizontal Milestone Cards */}
      <div className="hidden md:grid md:grid-cols-5 md:gap-4">
        {milestones.map((item) => (
          <div
            key={item.title}
            className="group relative flex flex-col justify-between rounded-lg border border-border bg-surface p-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/50"
          >
            <div>
              <div className="flex items-center justify-between border-b border-border pb-2 text-xs">
                <span className="font-bold text-primary">{item.year}</span>
                <span className="text-[11px] text-text-muted">{item.period}</span>
              </div>
              <h4 className="mt-2.5 font-display text-sm font-semibold text-text group-hover:text-primary">
                {item.title}
              </h4>
              <p className="mt-1.5 text-xs leading-relaxed text-text-muted">
                {item.description}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-border/50 text-[11px] font-medium text-text">
              {item.achievement}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile Vertical Milestone Flow */}
      <div className="relative border-l-2 border-border pl-4 space-y-6 md:hidden">
        {milestones.map((item) => (
          <div key={item.title} className="relative">
            {/* Knot dot on vertical line */}
            <span className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-primary bg-surface" />
            <div className="text-xs font-bold text-primary">{item.year} • {item.period}</div>
            <h4 className="text-sm font-semibold text-text mt-0.5">{item.title}</h4>
            <p className="text-xs text-text-muted mt-1">{item.description}</p>
            <div className="text-[11px] text-text font-medium mt-1">{item.achievement}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
