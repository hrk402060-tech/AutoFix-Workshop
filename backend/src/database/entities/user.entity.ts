import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
  WAREHOUSE = 'WAREHOUSE',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, length: 50 })
  username!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ nullable: true, length: 30 })
  phone?: string;

  @Column({ select: false })
  passwordHash!: string;

  @Column({ type: 'text', default: UserRole.EMPLOYEE })
  role!: UserRole;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}

