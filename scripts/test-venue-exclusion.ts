import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('apps/api/.env') });

const testDbUrl =
  (process.env.MIGRATION_DATABASE_URL || '').replace('/csi_gcet_dev', '/csi_gcet_test') ||
  'postgresql://csi_migrator:<choose-locally>@localhost:5432/csi_gcet_test';

async function runExclusionConstraintTests() {
  console.log('🧪 Starting PostgreSQL Exclusion Constraint Verification (M10)...');
  console.log('📡 Connecting to test database: csi_gcet_test');

  const client = new Client({ connectionString: testDbUrl });
  await client.connect();

  const dbCheck = await client.query<{ current_database: string }>('SELECT current_database();');
  const liveDb = dbCheck.rows[0]?.current_database;
  if (liveDb !== 'csi_gcet_test') {
    throw new Error(`[FATAL] Safety guard refused execution on "${liveDb}". Target must strictly be "csi_gcet_test".`);
  }
  console.log(`🔒 [VERIFIED] Live database verified as "${liveDb}".`);

  // Clean test tables
  await client.query(`DELETE FROM "registrations" WHERE true;`);
  await client.query(`DELETE FROM "event_guests" WHERE true;`);
  await client.query(`DELETE FROM "attendance_records" WHERE true;`);
  await client.query(`DELETE FROM "attendance_sessions" WHERE true;`);
  await client.query(`DELETE FROM "events" WHERE true;`);
  await client.query(`DELETE FROM "venues" WHERE true;`);

  // Create two test venues
  const v1Res = await client.query(`
    INSERT INTO "venues" ("name", "building", "capacity", "is_available", "is_active")
    VALUES ('Auditorium 1', 'Main Block', 300, true, true)
    RETURNING "id";
  `);
  const venueAId = v1Res.rows[0].id;

  const v2Res = await client.query(`
    INSERT INTO "venues" ("name", "building", "capacity", "is_available", "is_active")
    VALUES ('Seminar Hall B', 'IT Block', 150, true, true)
    RETURNING "id";
  `);
  const venueBId = v2Res.rows[0].id;

  console.log(`Created test venues: Venue A (${venueAId}), Venue B (${venueBId})`);

  // 1. Same venue initial booking
  await client.query(`
    INSERT INTO "events" ("slug", "title", "description", "venue_id", "starts_at", "ends_at", "capacity", "state")
    VALUES ('event-1', 'Event 1 (Initial)', 'Description 1', $1, '2026-12-01 10:00:00+00', '2026-12-01 12:00:00+00', 100, 'published');
  `, [venueAId]);
  console.log('✅ 1. Initial booking at Venue A accepted (10:00 - 12:00).');

  // 2. Same venue back-to-back booking (12:00 - 14:00) -> MUST SUCCEED
  await client.query(`
    INSERT INTO "events" ("slug", "title", "description", "venue_id", "starts_at", "ends_at", "capacity", "state")
    VALUES ('event-2', 'Event 2 (Back-to-Back)', 'Description 2', $1, '2026-12-01 12:00:00+00', '2026-12-01 14:00:00+00', 100, 'published');
  `, [venueAId]);
  console.log('✅ 2. Back-to-back booking at Venue A accepted (12:00 - 14:00, zero overlap in half-open interval).');

  // 3. Different venue overlapping booking (10:30 - 11:30 at Venue B) -> MUST SUCCEED
  await client.query(`
    INSERT INTO "events" ("slug", "title", "description", "venue_id", "starts_at", "ends_at", "capacity", "state")
    VALUES ('event-3', 'Event 3 (Different Venue)', 'Description 3', $1, '2026-12-01 10:30:00+00', '2026-12-01 11:30:00+00', 50, 'published');
  `, [venueBId]);
  console.log('✅ 3. Simultaneous booking at Venue B accepted without interference.');

  // 4. Same venue overlapping booking (11:00 - 13:00 at Venue A) -> MUST FAIL with 23P01
  let conflictCaught = false;
  try {
    await client.query(`
      INSERT INTO "events" ("slug", "title", "description", "venue_id", "starts_at", "ends_at", "capacity", "state")
      VALUES ('event-4', 'Event 4 (Conflict)', 'Description 4', $1, '2026-12-01 11:00:00+00', '2026-12-01 13:00:00+00', 100, 'published');
    `, [venueAId]);
  } catch (err: unknown) {
    const pgErr = err as { code?: string; constraint?: string; message?: string };
    if (pgErr.code === '23P01') {
      conflictCaught = true;
      console.log(`✅ 4. Overlapping booking at Venue A rejected by PostgreSQL exclusion constraint (SQLSTATE: ${pgErr.code}, constraint: ${pgErr.constraint}).`);
    } else {
      throw new Error(`Unexpected error code on conflict: ${pgErr.code} - ${pgErr.message}`);
    }
  }
  if (!conflictCaught) {
    throw new Error('FATAL: Overlapping booking was unexpectedly permitted at the database level!');
  }

  // 5. Overlapping booking but CANCELLED -> MUST SUCCEED
  await client.query(`
    INSERT INTO "events" ("slug", "title", "description", "venue_id", "starts_at", "ends_at", "capacity", "state")
    VALUES ('event-5', 'Event 5 (Cancelled)', 'Description 5', $1, '2026-12-01 10:30:00+00', '2026-12-01 11:30:00+00', 100, 'cancelled');
  `, [venueAId]);
  console.log('✅ 5. Cancelled overlapping event permitted without holding venue reservation.');

  // 6. Concurrent Booking Race Simulation
  console.log('⚡ 6. Running concurrent booking race simulation (2 concurrent clients at same venue & time)...');
  const client1 = new Client({ connectionString: testDbUrl });
  const client2 = new Client({ connectionString: testDbUrl });
  await client1.connect();
  await client2.connect();

  const raceTimeStart = '2026-12-05 14:00:00+00';
  const raceTimeEnd = '2026-12-05 16:00:00+00';

  const p1 = client1.query(`
    INSERT INTO "events" ("slug", "title", "description", "venue_id", "starts_at", "ends_at", "capacity", "state")
    VALUES ('race-event-1', 'Race Event 1', 'Desc', $1, '${raceTimeStart}', '${raceTimeEnd}', 100, 'published');
  `, [venueAId]);

  const p2 = client2.query(`
    INSERT INTO "events" ("slug", "title", "description", "venue_id", "starts_at", "ends_at", "capacity", "state")
    VALUES ('race-event-2', 'Race Event 2', 'Desc', $1, '${raceTimeStart}', '${raceTimeEnd}', 100, 'published');
  `, [venueAId]);

  const results = await Promise.allSettled([p1, p2]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];

  console.log(`Concurrent results: Fulfilled: ${fulfilled.length}, Rejected: ${rejected.length}`);

  if (fulfilled.length !== 1 || rejected.length !== 1) {
    throw new Error(`FATAL: Expected exactly 1 success and 1 rejection in concurrent race, got ${fulfilled.length} / ${rejected.length}`);
  }

  const rejectedError = rejected[0].reason;
  if (rejectedError.code !== '23P01') {
    throw new Error(`FATAL: Expected SQLSTATE 23P01 in concurrent race rejection, got: ${rejectedError.code}`);
  }

  console.log(`✅ 6. Concurrent race passed: Exactly 1 transaction succeeded, and 1 transaction was blocked with SQLSTATE 23P01 (${rejectedError.constraint}).`);

  await client1.end();
  await client2.end();

  // Cleanup test database
  await client.query(`DELETE FROM "events" WHERE true;`);
  await client.query(`DELETE FROM "venues" WHERE true;`);
  await client.end();

  console.log('\n🎉 ALL 6 POSTGRESQL EXCLUSION CONSTRAINT ACCEPTANCE TESTS PASSED!\n');
}

runExclusionConstraintTests().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});

