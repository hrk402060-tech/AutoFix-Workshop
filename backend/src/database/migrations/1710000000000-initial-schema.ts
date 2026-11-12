import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710000000000 implements MigrationInterface {
  name = 'InitialSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "users" ("id" varchar(36) PRIMARY KEY NOT NULL, "username" varchar(50) NOT NULL UNIQUE, "name" varchar(100) NOT NULL, "phone" varchar(30), "passwordHash" varchar(255) NOT NULL, "role" varchar(20) NOT NULL DEFAULT 'EMPLOYEE', "isActive" boolean NOT NULL DEFAULT 1, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE TABLE "vehicles" ("id" varchar(36) PRIMARY KEY NOT NULL, "plateNumber" varchar(20) NOT NULL, "vin" varchar(40), "brand" varchar(80), "model" varchar(80), "customerName" varchar(100), "customerPhone" varchar(30), "isActive" boolean NOT NULL DEFAULT 1, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE INDEX "IDX_vehicles_plate" ON "vehicles" ("plateNumber")`);
    await queryRunner.query(`CREATE INDEX "IDX_vehicles_vin" ON "vehicles" ("vin")`);
    await queryRunner.query(`CREATE TABLE "work_orders" ("id" varchar(36) PRIMARY KEY NOT NULL, "orderNo" varchar(30) NOT NULL UNIQUE, "vehicleId" varchar(36) NOT NULL, "status" varchar(30) NOT NULL DEFAULT 'PENDING', "customerRequest" text NOT NULL, "createdById" varchar(36) NOT NULL, "acceptanceNote" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await queryRunner.query(`CREATE TABLE "work_order_items" ("id" varchar(36) PRIMARY KEY NOT NULL, "workOrderId" varchar(36) NOT NULL, "title" varchar(120) NOT NULL, "note" text, CONSTRAINT "FK_items_order" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE)`);
    await queryRunner.query(`CREATE TABLE "work_order_participants" ("id" varchar(36) PRIMARY KEY NOT NULL, "workOrderId" varchar(36) NOT NULL, "userId" varchar(36) NOT NULL, "repairNote" text, CONSTRAINT "FK_participants_order" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE, CONSTRAINT "FK_participants_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE TABLE "audit_logs" ("id" varchar(36) PRIMARY KEY NOT NULL, "actorId" varchar(36) NOT NULL, "action" varchar(80) NOT NULL, "resource" varchar(80) NOT NULL, "resourceId" varchar(80), "metadata" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "work_order_participants"`);
    await queryRunner.query(`DROP TABLE "work_order_items"`);
    await queryRunner.query(`DROP TABLE "work_orders"`);
    await queryRunner.query(`DROP INDEX "IDX_vehicles_vin"`);
    await queryRunner.query(`DROP INDEX "IDX_vehicles_plate"`);
    await queryRunner.query(`DROP TABLE "vehicles"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}

