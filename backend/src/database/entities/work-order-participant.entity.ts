import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { WorkOrder } from './work-order.entity';

@Entity('work_order_participants')
export class WorkOrderParticipant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  workOrderId!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'text', nullable: true })
  repairNote?: string;

  @ManyToOne(() => WorkOrder, (workOrder) => workOrder.participants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workOrderId' })
  workOrder!: WorkOrder;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'userId' })
  user!: User;
}

