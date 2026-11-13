import { MigrationInterface, QueryRunner } from 'typeorm';

export class PartLifecycle1794535200000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query('ALTER TABLE stock_transactions ADD COLUMN operationId varchar');
    await q.query('CREATE UNIQUE INDEX idx_stock_operation ON stock_transactions(operationId)');
    await q.query('CREATE INDEX idx_material_part ON material_requests(partId)');
    await q.query('CREATE INDEX idx_stock_part ON stock_transactions(partId)');
  }

  async down(q: QueryRunner) {
    await q.query('DROP INDEX idx_stock_part');
    await q.query('DROP INDEX idx_material_part');
    await q.query('DROP INDEX idx_stock_operation');
    await q.query('ALTER TABLE stock_transactions DROP COLUMN operationId');
  }
}
