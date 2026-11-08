import { resolve, join } from 'node:path';
import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const apiEnvPath = resolve(join('apps', 'api', '.env'));
dotenv.config({ path: apiEnvPath });
dotenv.config();

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

async function main() {
  console.log('================================================================');
  console.log(' CSI GCET SB — Development Test Credentials Provisioner');
  console.log('================================================================\n');

  const defaultPassword = 'Password@1234';
  const passwordHash = await hashPassword(defaultPassword);

  // 1. Ensure roles exist
  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map((r) => [r.code, r.id]));

  if (!roleMap.has('admin') || !roleMap.has('member')) {
    console.log('Roles missing; running seed logic first...');
    await prisma.role.upsert({
      where: { code: 'admin' },
      update: {},
      create: { code: 'admin', name: 'Administrator', description: 'System Administrator' },
    });
    await prisma.role.upsert({
      where: { code: 'member' },
      update: {},
      create: { code: 'member', name: 'Registered Member', description: 'Registered CSI GCET Member' },
    });
    await prisma.role.upsert({
      where: { code: 'core' },
      update: {},
      create: { code: 'core', name: 'Core Committee Head', description: 'Core Head' },
    });
    const refreshed = await prisma.role.findMany();
    refreshed.forEach((r) => roleMap.set(r.code, r.id));
  }

  // 2. Define test accounts
  const testAccounts = [
    {
      email: 'admin@gcet.edu.in',
      name: 'Branch Administrator',
      enrollmentNo: 'ADMIN001',
      branch: 'Information Technology',
      year: 4,
      status: 'active',
      roles: ['admin', 'member'],
      description: 'System Administrator (Access to Admin Dashboard, Verification, Drives, Terms, Venues)',
    },
    {
      email: 'member@gcet.edu.in',
      name: 'Aarav Patel',
      enrollmentNo: '22IT045',
      branch: 'Information Technology',
      year: 3,
      status: 'active',
      roles: ['member'],
      description: 'Active CSI Member (Access to Member Dashboard, Digital ID Card Pass, Passport)',
    },
    {
      email: 'student@gcet.edu.in',
      name: 'Riya Sharma',
      enrollmentNo: '23CP012',
      branch: 'Computer Engineering',
      year: 2,
      status: 'active',
      roles: ['member'],
      description: 'Normal Student / Member (Access to Member Dashboard, Events, Registration)',
    },
    {
      email: 'core@gcet.edu.in',
      name: 'Dev Lead',
      enrollmentNo: '21IT088',
      branch: 'Information Technology',
      year: 4,
      status: 'active',
      roles: ['core', 'member'],
      description: 'Core Committee Head (Access to Workspaces, Checklists, Tasks, Asset Management)',
    },
  ];

  console.log('Setting up test accounts...\n');

  for (const acc of testAccounts) {
    const user = await prisma.user.upsert({
      where: { email: acc.email },
      update: {
        name: acc.name,
        enrollmentNo: acc.enrollmentNo,
        branch: acc.branch,
        year: acc.year,
        status: acc.status,
        passwordHash,
      },
      create: {
        email: acc.email,
        name: acc.name,
        enrollmentNo: acc.enrollmentNo,
        branch: acc.branch,
        year: acc.year,
        status: acc.status,
        passwordHash,
      },
    });

    // Assign roles
    for (const roleCode of acc.roles) {
      const roleId = roleMap.get(roleCode);
      if (roleId) {
        const existing = await prisma.roleAssignment.findFirst({
          where: {
            userId: user.id,
            roleId,
          },
        });

        if (!existing) {
          await prisma.roleAssignment.create({
            data: {
              userId: user.id,
              roleId,
              termStart: new Date('2026-01-01T00:00:00Z'),
            },
          });
        }
      }
    }

    console.log(`[READY] ${acc.name}`);
    console.log(`  - Email:    ${acc.email}`);
    console.log(`  - Password: ${defaultPassword}`);
    console.log(`  - Roles:    [${acc.roles.join(', ')}]`);
    console.log(`  - Purpose:  ${acc.description}\n`);
  }

  // 3. Print summary of all existing users in database
  const allUsers = await prisma.user.findMany({
    include: {
      roleAssignments: {
        include: { role: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log('================================================================');
  console.log(` Total registered accounts in database: ${allUsers.length}`);
  console.log('================================================================\n');
}

main()
  .catch((e) => {
    console.error('[ERROR] Failed setting up test accounts:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
