import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WorkOrder } from './work-order.entity';

@Entity('work_order_items')
export class WorkOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  workOrderId!: string;

  @Column({ length: 120 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @ManyToOne(() => WorkOrder, (workOrder) => workOrder.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workOrderId' })
  workOrder!: WorkOrder;
}

