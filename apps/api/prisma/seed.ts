import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding roles and committees (Hard Rule 8: No demo users)...');

  // Seed system roles (Appendix A & B)
  const roles = [
    {
      code: 'admin',
      name: 'Administrator',
      description: 'System Administrator with full management and configuration access',
    },
    {
      code: 'president',
      name: 'President',
      description:
        'Student Branch President with executive oversight and administrative privileges',
    },
    {
      code: 'vp',
      name: 'Vice President',
      description:
        'Student Branch Vice President with executive oversight and administrative privileges',
    },
    {
      code: 'faculty',
      name: 'Faculty Advisor',
      description: 'Branch Faculty Advisor with read, dashboard, and export permissions',
    },
    {
      code: 'core',
      name: 'Core Committee Head',
      description:
        'Core Head with committee-level event, attendance, and asset management permissions',
    },
    {
      code: 'subcore',
      name: 'Sub-Core Executive',
      description: 'Sub-Core Executive with venue booking, workspace, and attendance operations',
    },
    {
      code: 'committee',
      name: 'Committee Member',
      description:
        'Committee Volunteer with workspace access, attendance scanning, and asset uploads',
    },
    {
      code: 'member',
      name: 'Registered Member',
      description:
        'Standard CSI GCET Student Branch member with dashboard, ID card, and registration access',
    },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: {
        name: role.name,
        description: role.description,
      },
      create: role,
    });
  }
  console.log(`✅ Seeded ${roles.length} roles.`);

  // Seed core committees (Appendix B & prompt.md §13)
  const committees = [
    {
      code: 'logistics',
      name: 'Logistics & Operations',
      description: 'Manages venue preparation, equipment checklists, and physical event setup',
    },
    {
      code: 'technical',
      name: 'Technical Committee',
      description:
        'Oversees technical infrastructure, software challenges, workshops, and lab operations',
    },
    {
      code: 'graphics',
      name: 'Design & Graphics',
      description: 'Produces digital posters, certificates, branding assets, and promotional media',
    },
    {
      code: 'documentation',
      name: 'Content & Documentation',
      description:
        'Records event reports, minutes, official correspondence, and post-event publications',
    },
  ];

  for (const committee of committees) {
    await prisma.committee.upsert({
      where: { code: committee.code },
      update: {
        name: committee.name,
        description: committee.description,
      },
      create: committee,
    });
  }
  console.log(`✅ Seeded ${committees.length} committees.`);

  console.log('🌱 Seeding complete.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
