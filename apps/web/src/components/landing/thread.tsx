'use client';

import React, { useState, useEffect } from 'react';

interface SectionKnot {
  id: string;
  label: string;
}

const SECTIONS: SectionKnot[] = [
  { id: 'hero', label: 'Top' },
  { id: 'about', label: 'Charter' },
  { id: 'activities', label: 'Activities' },
  { id: 'events', label: 'Events' },
  { id: 'journey', label: 'Journey' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'team', label: 'Leadership' },
  { id: 'join', label: 'Join' },
  { id: 'faq', label: 'FAQ' },
  { id: 'footer', label: 'Contact' },
];

export function Thread() {
  const [activeSection, setActiveSection] = useState<string>('hero');
  const [scrollProgress, setScrollProgress] = useState<number>(0);

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const progress = Math.min(1, Math.max(0, window.scrollY / totalHeight));
        setScrollProgress(progress);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    // IntersectionObserver for active section highlight
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, observerOptions);

    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      {/* Mobile Top Progress Bar (Under Header) */}
      <div
        className="fixed top-16 left-0 right-0 z-30 h-1 bg-border/40 md:hidden"
        aria-hidden="true"
      >
        <div
          className="h-full bg-primary transition-all duration-150"
          style={{ width: `${scrollProgress * 100}%` }}
        />
      </div>

      {/* Desktop Fixed Left Thread Navigation */}
      <aside
        className="fixed left-6 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center xl:flex"
        aria-label="Section Navigation"
      >
        <nav aria-label="Page sections" className="relative flex flex-col items-center">
          {/* Thread Background Line */}
          <div
            className="absolute top-2 bottom-2 w-0.5 bg-border rounded-full"
            aria-hidden="true"
          />

          {/* Active Progress Fill Line */}
          <div
            className="absolute top-2 w-0.5 bg-primary rounded-full transition-all duration-150 origin-top"
            style={{
              height: `calc(${scrollProgress * 100}% - 16px)`,
              maxHeight: 'calc(100% - 16px)',
            }}
            aria-hidden="true"
          />

          {/* Knots on the Thread */}
          <div className="relative flex flex-col gap-6 py-2">
            {SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="group relative flex items-center"
                  aria-label={`Jump to ${section.label}`}
                >
                  {/* Knot Indicator Dot */}
                  <span
                    className={`h-3 w-3 rounded-full border-2 transition-all duration-200 ${
                      isActive
                        ? 'border-primary bg-primary scale-125 shadow-sm'
                        : 'border-border bg-surface hover:border-primary/60'
                    }`}
                  />

                  {/* Accessible Hover Tooltip Label */}
                  <span className="pointer-events-none absolute left-6 whitespace-nowrap rounded bg-surface border border-border px-2 py-0.5 text-[11px] font-medium text-text opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100">
                    {section.label}
                  </span>
                </a>
              );
            })}
          </div>
        </nav>
      </aside>
    </>
  );
}

