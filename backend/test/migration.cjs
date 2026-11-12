const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { DataSource } = require('typeorm');
const { InitialSchema1710000000000 } = require('../dist/database/migrations/1710000000000-initial-schema');
const { PcWorkflows1794456000000 } = require('../dist/database/migrations/1794456000000-pc-workflows');

async function run() {
  const root = resolve(__dirname, '../../tmp');
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(join(root, 'migration-check-'));
  const db = new DataSource({ type: 'sqlite', database: join(dir, 'legacy.sqlite'), migrations: [InitialSchema1710000000000] });
  await db.initialize();
  try {
    await db.runMigrations();
    await db.query("INSERT INTO users (id, username, name, passwordHash) VALUES ('u1', 'legacy', 'Legacy mechanic', 'test-only')");
    await db.query("INSERT INTO vehicles (id, plateNumber) VALUES ('v1', 'LEGACY-001')");
    await db.query("INSERT INTO work_orders (id, orderNo, vehicleId, customerRequest, createdById) VALUES ('o1', 'LEGACY-WO', 'v1', 'Legacy repair', 'u1')");
    await db.query("INSERT INTO work_order_participants (id, workOrderId, userId, repairNote) VALUES ('p1', 'o1', 'u1', 'Legacy repair note')");
    db.migrations.push(new PcWorkflows1794456000000());
    await db.runMigrations();
    assert.equal((await db.query('SELECT * FROM vehicles'))[0].plateNumber, 'LEGACY-001');
    assert.equal((await db.query('SELECT * FROM work_orders'))[0].orderNo, 'LEGACY-WO');
    const records = await db.query('SELECT * FROM repair_records');
    assert.equal(records.length, 1);
    assert.equal(records[0].note, 'Legacy repair note');
    assert.equal(records[0].authorId, 'u1');
    assert.deepEqual(await db.runMigrations(), []);
    assert.equal((await db.query('PRAGMA integrity_check'))[0].integrity_check, 'ok');
    assert.deepEqual(await db.query('PRAGMA foreign_key_check'), []);
    console.log('PASS populated legacy migration: vehicles, orders, authors, repair notes, integrity, repeat startup.');
  } finally {
    await db.destroy();
  }
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
