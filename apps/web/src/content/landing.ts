export interface ActivityItem {
  id: string;
  title: string;
  category: string;
  description: string;
  deliverables: string[];
}

export interface MilestoneItem {
  year: string;
  period: string;
  title: string;
  description: string;
  achievement: string;
}

export interface LandingContent {
  hero: {
    badge: string;
    headline: string;
    headlineAccent: string;
    subheadline: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
  about: {
    title: string;
    subtitle: string;
    nationalHeritage: string;
    gcetCharter: string;
    statsHeading: string;
  };
  activities: {
    title: string;
    subtitle: string;
    items: ActivityItem[];
  };
  journey: {
    title: string;
    subtitle: string;
    milestones: MilestoneItem[];
  };
  team: {
    title: string;
    subtitle: string;
    governanceTiers: {
      title: string;
      role: string;
      scope: string;
      description: string;
    }[];
    rosterNotice: string;
  };
  join: {
    title: string;
    subtitle: string;
    steps: {
      step: number;
      title: string;
      detail: string;
    }[];
    eligibilityNotice: string;
  };
  footer: {
    legalNotice: string;
    grievanceContact: string;
    campusAddress: string;
  };
}

export const landingContent: LandingContent = {
  hero: {
    badge: 'Computer Society of India • GCET SB Chapter',
    headline: 'Advancing Computing Excellence &',
    headlineAccent: 'Technical Leadership',
    subheadline:
      'The institutional technology organisation of G H Patel College of Engineering & Technology, Vallabh Vidyanagar. Dedicated to systems engineering, hands-on masterclasses, verified credentials, and technical rigor.',
    ctaPrimary: 'Join CSI GCET',
    ctaSecondary: 'Member Portal',
  },
  about: {
    title: 'Institutional Foundation & Charter',
    subtitle: 'Connecting national computing heritage with collegiate engineering mastery',
    nationalHeritage:
      'Established nationally in 1965, the Computer Society of India is the premier national body for computing and information technology professionals. The CSI national network provides students access to technical symposiums, research journals, and national conventions.',
    gcetCharter:
      'Formed under Charutar Vidyamandal (CVM) at G H Patel College of Engineering & Technology in Vallabh Vidyanagar (Region III), the GCET Student Branch is committed to closing the gap between academic curricula and cutting-edge software engineering.',
    statsHeading: 'Student Branch Operational Metrics',
  },
  activities: {
    title: 'Core Technical Activities & Programs',
    subtitle: 'Practical, rigorous, and student-driven technical tracks',
    items: [
      {
        id: 'workshops',
        title: 'Developer Masterclasses & Lab Bootcamps',
        category: 'Applied Engineering',
        description:
          'Deep-dive, full-day laboratory workshops focused on distributed systems, Linux internals, full-stack architecture, and containerized deployment.',
        deliverables: ['Production-grade source repositories', 'Automated testing and CI/CD pipelines', 'Peer code reviews'],
      },
      {
        id: 'sprints',
        title: 'Code Sprints & Hackathons',
        category: 'Problem Solving',
        description:
          'Time-constrained collegiate hackathons and algorithmic competitions tackling real-world problem statements and institutional automation.',
        deliverables: ['Working minimum viable products', 'Jury defense presentations', 'Verifiable repository milestones'],
      },
      {
        id: 'keynotes',
        title: 'Technology Keynotes & Alumni Dialogues',
        category: 'Industry Knowledge',
        description:
          'Technical lectures and architecture briefings delivered by alumni engineers, researchers, and distinguished technical fellows from industry.',
        deliverables: ['Architecture walkthroughs', 'Career progression frameworks', 'Direct technical Q&A'],
      },
      {
        id: 'credentials',
        title: 'Cryptographic Credentials & Audit Logs',
        category: 'Institutional Trust',
        description:
          'Tamper-evident, single-use verifiable credentials for symposium participation, workshop completion, and executive committee service.',
        deliverables: ['Ed25519-signed credentials', 'Immutable append-only audit trail', 'Public instant verification'],
      },
    ],
  },
  journey: {
    title: 'Chapter Journey & Historical Highlights',
    subtitle: 'Milestones of student achievement, leadership, and technical consistency',
    milestones: [
      {
        year: '2024',
        period: 'Q1 2024',
        title: 'Regional Technical Symposium',
        description: 'Hosted Region III collegiate competitive programming and engineering symposium across 14 colleges.',
        achievement: 'Over 400 collegiate participants',
      },
      {
        year: '2024',
        period: 'Q3 2024',
        title: 'Infrastructure & Linux Engineering Sprint',
        description: 'Curated 48-hour hands-on lab on Linux kernel internals, networking primitives, and cloud orchestration.',
        achievement: '100% lab completion rate',
      },
      {
        year: '2025',
        period: 'Q1 2025',
        title: 'Student Branch Leadership Excellence',
        description: 'Recognized within Region III for structured peer mentorship and continuous technical workshop cadence.',
        achievement: 'Award of Excellence in Region III',
      },
      {
        year: '2025',
        period: 'Q4 2025',
        title: 'Next-Gen Platform Modernization',
        description: 'Migrated branch platform to modern, server-rendered Next.js and NestJS architecture with cryptographic attendance.',
        achievement: 'Zero-downtime student portal',
      },
      {
        year: '2026',
        period: 'Session 2026-27',
        title: 'Annual Flagship Masterclasses',
        description: 'Launching comprehensive curriculum covering distributed systems, web security, and high-throughput databases.',
        achievement: 'Active academic session',
      },
    ],
  },
  team: {
    title: 'Leadership & Committee Governance',
    subtitle: 'Four-tier constitutional structure driven by faculty mentorship and student autonomy',
    governanceTiers: [
      {
        title: 'Faculty Advisory',
        role: 'Student Branch Counselor',
        scope: 'Institutional Alignment & Guidance',
        description: 'Senior faculty counselor providing academic alignment, ethical governance, and institutional sponsorship.',
      },
      {
        title: 'Executive Leadership',
        role: 'President & Vice President',
        scope: 'Strategic Direction & Oversight',
        description: 'Elected student executives responsible for overall chapter health, cross-committee orchestration, and CVM liaison.',
      },
      {
        title: 'Core Committee Heads',
        role: 'Committee Heads',
        scope: 'Specialized Working Portfolios',
        description: 'Six specialized working committees: Technical, Logistics, Content & Documentation, Design, PR, and Finance.',
      },
      {
        title: 'Sub-Core Executives',
        role: 'Executive Volunteers',
        scope: 'Field Operations & Execution',
        description: 'Dedicated student executives executing event registrations, technical workshops, and laboratory logistics.',
      },
    ],
    rosterNotice: 'To protect student privacy, member rosters and contact information are strictly gated to authenticated member dashboards.',
  },
  join: {
    title: 'Membership & Registration Pathway',
    subtitle: 'Transparent, roster-verified onboarding for GCET engineering students',
    steps: [
      {
        step: 1,
        title: 'Roster Verification',
        detail: 'Enter your collegiate enrollment number to match against the verified academic roster for the active academic year.',
      },
      {
        step: 2,
        title: 'Institutional Credentials',
        detail: 'Set up your secure student account with NIST-compliant password guidelines and institutional email confirmation.',
      },
      {
        step: 3,
        title: 'Member Portal Access',
        detail: 'Access your authenticated dashboard, event registrations, cryptographic attendance QR pass, and digital certificates.',
      },
    ],
    eligibilityNotice: 'Membership is open to all enrolled students of G H Patel College of Engineering & Technology across all engineering departments.',
  },
  footer: {
    legalNotice: 'CSI GCET Student Branch is an authorized collegiate chapter of the Computer Society of India under Charutar Vidyamandal (CVM).',
    grievanceContact: 'grievance.csi@gcet.ac.in',
    campusAddress: 'Bakrol Road, Vallabh Vidyanagar, Gujarat 388120, India',
  },
};

