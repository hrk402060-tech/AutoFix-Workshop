import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../database/entities/audit-log.entity';
import { User } from '../database/entities/user.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { WorkOrderItem } from '../database/entities/work-order-item.entity';
import { WorkOrderParticipant } from '../database/entities/work-order-participant.entity';
import { WorkOrder } from '../database/entities/work-order.entity';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, User, Vehicle, WorkOrder, WorkOrderItem, WorkOrderParticipant])],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}

