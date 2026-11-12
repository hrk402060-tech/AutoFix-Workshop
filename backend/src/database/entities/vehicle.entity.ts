import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ length: 20 })
  plateNumber!: string;

  @Index()
  @Column({ nullable: true, length: 40 })
  vin?: string;

  @Column({ nullable: true, length: 80 })
  brand?: string;

  @Column({ nullable: true, length: 80 })
  model?: string;

  @Column({ nullable: true, length: 100 })
  customerName?: string;

  @Column({ nullable: true, length: 30 })
  customerPhone?: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}

