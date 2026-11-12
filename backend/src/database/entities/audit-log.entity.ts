import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  actorId!: string;

  @Column({ length: 80 })
  action!: string;

  @Column({ length: 80 })
  resource!: string;

  @Column({ nullable: true, length: 80 })
  resourceId?: string;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;
}

