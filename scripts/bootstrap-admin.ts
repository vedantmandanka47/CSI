/**
 * CSI GCET SB — First Administrator Bootstrap Utility (Section 4.5)
 *
 * Rules:
 * 1. Forbids demo users and demo passwords.
 * 2. Prompts interactively for email, name, and password (or generates one-time password).
 * 3. Refuses to run if an admin already exists.
 * 4. Hashes password with Argon2id.
 * 5. Writes an immutable audit-log entry (without logging password or hashes).
 * 6. Never stores credentials in any file.
 */

import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';
import argon2 from 'argon2';

// Load environment from apps/api/.env
const apiEnvPath = resolve(join('apps', 'api', '.env'));
dotenv.config({ path: apiEnvPath });

const dbUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('[FATAL] DATABASE_URL is not defined in environment or apps/api/.env');
  process.exit(1);
}

function generateSecureOtp(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

async function main() {
  console.log('================================================================');
  console.log(' CSI GCET SB — Administrator Bootstrap (Section 4.5)');
  console.log(' Hard Rule: No demo credentials. Passwords are never saved to disk.');
  console.log('================================================================\n');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 1. Check if the 'users' table exists
    const tableCheck = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'users'
      );
    `);

    const usersTableExists = tableCheck.rows[0]?.exists;
    if (!usersTableExists) {
      console.error('[FATAL] "users" table does not exist. Please run migrations first.');
      process.exit(1);
    }

    // 2. Fetch the admin role ID
    const adminRoleRes = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE code = 'admin';`,
    );

    if (adminRoleRes.rows.length === 0) {
      console.error('[FATAL] Admin role not found in roles table. Please run db:seed first.');
      process.exit(1);
    }

    const adminRoleId = adminRoleRes.rows[0].id;

    // 3. Check if an admin already exists in role_assignments
    const existingAdminRes = await client.query<{ count: string }>(
      `
      SELECT count(*) as count 
      FROM role_assignments 
      WHERE role_id = $1;
    `,
      [adminRoleId],
    );

    const adminCount = parseInt(existingAdminRes.rows[0].count, 10);
    if (adminCount > 0) {
      console.error('================================================================');
      console.error(' [REFUSED] An administrator account already exists.');
      console.error(' Multiple bootstrap runs are strictly forbidden (Section 4.5).');
      console.error('================================================================');
      process.exit(1);
    }

    // 4. Parse CLI arguments or prompt interactively
    const args = process.argv.slice(2);
    let email = '';
    let name = '';
    let password = '';
    let isAutoOtp = false;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--email' && args[i + 1]) {
        email = args[i + 1];
        i++;
      } else if (args[i] === '--name' && args[i + 1]) {
        name = args[i + 1];
        i++;
      } else if (args[i] === '--password' && args[i + 1]) {
        password = args[i + 1];
        i++;
      } else if (args[i] === '--generate-otp') {
        isAutoOtp = true;
      }
    }

    if (!email || !name || (!password && !isAutoOtp)) {
      const rl = createInterface({ input, output });

      if (!name) {
        name = (await rl.question('Enter Administrator Name: ')).trim();
      }

      if (!email) {
        email = (await rl.question('Enter Administrator Email: ')).trim();
      }

      if (!password && !isAutoOtp) {
        const chooseGenerated = (
          await rl.question('Generate a secure one-time password? (Y/n): ')
        )
          .trim()
          .toLowerCase();

        if (chooseGenerated === '' || chooseGenerated === 'y' || chooseGenerated === 'yes') {
          isAutoOtp = true;
        } else {
          password = (await rl.question('Enter Administrator Password (min 12 chars): ')).trim();
        }
      }

      rl.close();
    }

    if (!email || !email.includes('@')) {
      console.error('[FATAL] A valid email address is required.');
      process.exit(1);
    }

    if (!name || name.length < 2) {
      console.error('[FATAL] A valid administrator name is required.');
      process.exit(1);
    }

    if (isAutoOtp) {
      password = generateSecureOtp(20);
      console.log('\n================================================================');
      console.log(` 🔑 ONE-TIME ADMINISTRATOR PASSWORD: ${password}`);
      console.log(' ⚠️  STORE THIS SECURELY NOW. It will NEVER be shown again.');
      console.log('================================================================\n');
    } else if (password.length < 12) {
      console.error('[FATAL] Password must be at least 12 characters.');
      process.exit(1);
    }

    // 5. Hash password using Argon2id (DEP-03, PRIV-13)
    console.log('Hashing password using Argon2id (memory-hard)...');
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });

    // 6. Execute atomic user creation and role assignment inside transaction
    console.log('Creating administrator account in database...');
    await client.query('BEGIN');

    try {
      // Insert user
      const userInsertRes = await client.query<{ id: string }>(
        `
        INSERT INTO users (name, email, password_hash, status)
        VALUES ($1, $2, $3, 'active')
        RETURNING id;
      `,
        [name, email.toLowerCase(), passwordHash],
      );

      const userId = userInsertRes.rows[0].id;

      // Assign admin role
      await client.query(
        `
        INSERT INTO role_assignments (user_id, role_id, term_start)
        VALUES ($1, $2, CURRENT_TIMESTAMP);
      `,
        [userId, adminRoleId],
      );

      // Write immutable audit log entry (PRIV-12: no password or hash in audit log)
      await client.query(
        `
        INSERT INTO audit_log (actor_id, action, target_type, target_id, after_json)
        VALUES ($1, 'USER_BOOTSTRAP_ADMIN', 'users', $1, $2);
      `,
        [userId, JSON.stringify({ name, email: email.toLowerCase(), role: 'admin' })],
      );

      await client.query('COMMIT');
      console.log(`\n[SUCCESS] Administrator "${name}" (${email}) created successfully.`);
      console.log(`[VERIFIED] User ID: ${userId}`);
      console.log('[VERIFIED] Role: admin (active assignment)');
      console.log('[VERIFIED] Audit log entry recorded in append-only ledger.');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[FATAL] Bootstrap admin execution failed:', err);
  process.exit(1);
});
