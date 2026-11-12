import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { User } from './entities/user.entity';
import { Vehicle } from './entities/vehicle.entity';
import { WorkOrderItem } from './entities/work-order-item.entity';
import { WorkOrderParticipant } from './entities/work-order-participant.entity';
import { WorkOrder } from './entities/work-order.entity';
import { InitialSchema1710000000000 } from './migrations/1710000000000-initial-schema';

export default new DataSource({
  type: 'sqlite',
  database: process.env.DATABASE_PATH || './data/autofix.sqlite',
  entities: [AuditLog, User, Vehicle, WorkOrder, WorkOrderItem, WorkOrderParticipant],
  migrations: [InitialSchema1710000000000],
});

