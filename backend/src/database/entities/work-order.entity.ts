import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { WorkOrderItem } from './work-order-item.entity';
import { WorkOrderParticipant } from './work-order-participant.entity';

export enum WorkOrderStatus {
  PENDING = 'PENDING',
  REPAIRING = 'REPAIRING',
  WAITING_ACCEPTANCE = 'WAITING_ACCEPTANCE',
  COMPLETED = 'COMPLETED',
  REWORKING = 'REWORKING',
  CANCELLED = 'CANCELLED',
}

@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 30 })
  orderNo!: string;

  @Column({ type: 'varchar', length: 36 })
  vehicleId!: string;

  @Column({ type: 'text', default: WorkOrderStatus.PENDING })
  status!: WorkOrderStatus;

  @Column({ type: 'text' })
  customerRequest!: string;

  @Column({ type: 'varchar', length: 36 })
  createdById!: string;

  @Column({ nullable: true, type: 'text' })
  acceptanceNote?: string;

  @OneToMany(() => WorkOrderItem, (item) => item.workOrder)
  items!: WorkOrderItem[];

  @OneToMany(() => WorkOrderParticipant, (participant) => participant.workOrder)
  participants!: WorkOrderParticipant[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}

