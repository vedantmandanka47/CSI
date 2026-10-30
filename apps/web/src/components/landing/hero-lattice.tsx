'use client';

import React from 'react';

export function HeroLattice() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden opacity-30 select-none"
      aria-hidden="true"
    >
      <svg
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1200 800"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern
            id="indigo-lattice"
            width="60"
            height="60"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 60 0 L 0 60 M 0 0 L 60 60"
              stroke="currentColor"
              strokeWidth="0.75"
              className="text-border"
            />
            <circle cx="30" cy="30" r="1.5" className="fill-primary/40" />
          </pattern>
          <radialGradient id="lattice-gradient" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.8" />
            <stop offset="80%" stopColor="white" stopOpacity="0.1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          <mask id="lattice-mask">
            <rect width="100%" height="100%" fill="url(#lattice-gradient)" />
          </mask>
        </defs>

        <rect
          width="100%"
          height="100%"
          fill="url(#indigo-lattice)"
          mask="url(#lattice-mask)"
        />
      </svg>
    </div>
  );
}
