import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('repair_records')
export class RepairRecord {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() workOrderId!: string;
  @Column() authorId!: string;
  @Column('text') note!: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('photos')
export class Photo {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() workOrderId!: string;
  @Column() authorId!: string;
  @Column() stage!: string;
  @Column() path!: string;
  @Column() mime!: string;
  @Column('integer') size!: number;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('parts')
export class Part {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) code!: string;
  @Column() name!: string;
  @Column() specification!: string;
  @Column() unit!: string;
  @Column('integer', { default: 0 }) quantity!: number;
  @Column({ default: true }) isActive!: boolean;
}

@Entity('material_requests')
export class MaterialRequest {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() workOrderId!: string;
  @Column() partId!: string;
  @Column() applicantId!: string;
  @Column() type!: string;
  @Column('integer') quantity!: number;
  @Column() status!: string;
  @Column('text') note!: string;
  @Column({ nullable: true }) reviewerId?: string;
  @CreateDateColumn() createdAt!: Date;
}

@Entity('stock_transactions')
export class StockTransaction {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() partId!: string;
  @Column() actorId!: string;
  @Column() type!: string;
  @Column('integer') quantity!: number;
  @Column('text') note!: string;
  @Column({ nullable: true, unique: true }) requestId?: string;
  @CreateDateColumn() createdAt!: Date;
}

export const businessEntities = [RepairRecord, Photo, Part, MaterialRequest, StockTransaction];
