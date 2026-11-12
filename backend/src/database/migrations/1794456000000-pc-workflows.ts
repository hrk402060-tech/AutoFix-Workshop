import { MigrationInterface, QueryRunner } from 'typeorm';

export class PcWorkflows1794456000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query('ALTER TABLE vehicles ADD COLUMN createdById varchar REFERENCES users(id)');
    await q.query(`CREATE TABLE repair_records (id varchar PRIMARY KEY, workOrderId varchar NOT NULL REFERENCES work_orders(id), authorId varchar NOT NULL REFERENCES users(id), note text NOT NULL, createdAt datetime NOT NULL DEFAULT (datetime('now')))`);
    await q.query(`INSERT INTO repair_records (id, workOrderId, authorId, note, createdAt) SELECT p.id, p.workOrderId, p.userId, p.repairNote, o.updatedAt FROM work_order_participants p JOIN work_orders o ON o.id = p.workOrderId WHERE p.repairNote IS NOT NULL AND trim(p.repairNote) <> ''`);
    await q.query(`CREATE TABLE photos (id varchar PRIMARY KEY, workOrderId varchar NOT NULL REFERENCES work_orders(id), authorId varchar NOT NULL REFERENCES users(id), stage varchar NOT NULL CHECK(stage IN ('VEHICLE','BEFORE','DURING','AFTER')), path varchar NOT NULL UNIQUE, mime varchar NOT NULL, size integer NOT NULL, createdAt datetime NOT NULL DEFAULT (datetime('now')))`);
    await q.query(`CREATE INDEX idx_photos_order ON photos(workOrderId)`);
    await q.query(`CREATE INDEX idx_records_order ON repair_records(workOrderId)`);
    await q.query(`CREATE TABLE parts (id varchar PRIMARY KEY, code varchar NOT NULL UNIQUE, name varchar NOT NULL, specification varchar NOT NULL DEFAULT '', unit varchar NOT NULL, quantity integer NOT NULL DEFAULT 0 CHECK(quantity >= 0), isActive boolean NOT NULL DEFAULT 1)`);
    await q.query(`CREATE TABLE material_requests (id varchar PRIMARY KEY, workOrderId varchar NOT NULL REFERENCES work_orders(id), partId varchar NOT NULL REFERENCES parts(id), applicantId varchar NOT NULL REFERENCES users(id), type varchar NOT NULL CHECK(type IN ('OUT','RETURN')), quantity integer NOT NULL CHECK(quantity > 0), status varchar NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED')), note text NOT NULL, reviewerId varchar REFERENCES users(id), createdAt datetime NOT NULL DEFAULT (datetime('now')))`);
    await q.query(`CREATE TABLE stock_transactions (id varchar PRIMARY KEY, partId varchar NOT NULL REFERENCES parts(id), actorId varchar NOT NULL REFERENCES users(id), type varchar NOT NULL, quantity integer NOT NULL CHECK(quantity > 0), note text NOT NULL, requestId varchar UNIQUE REFERENCES material_requests(id), createdAt datetime NOT NULL DEFAULT (datetime('now')))`);
    await q.query(`CREATE UNIQUE INDEX idx_participant_unique ON work_order_participants(workOrderId, userId)`);
    await q.query(`CREATE INDEX idx_participant_user ON work_order_participants(userId)`);
  }
  async down(q: QueryRunner) {
    for (const table of ['stock_transactions', 'material_requests', 'parts', 'photos', 'repair_records']) {
      await q.query(`DROP TABLE "${table}"`);
    }
    await q.query('DROP INDEX idx_participant_unique');
    await q.query('DROP INDEX idx_participant_user');
    await q.query('ALTER TABLE vehicles DROP COLUMN createdById');
  }
}
