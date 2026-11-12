import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseSettingsModule } from './database/database-settings.module';
import { AuthModule } from './auth/auth.module';
import { AuditLog } from './database/entities/audit-log.entity';
import { User } from './database/entities/user.entity';
import { Vehicle } from './database/entities/vehicle.entity';
import { WorkOrderItem } from './database/entities/work-order-item.entity';
import { WorkOrderParticipant } from './database/entities/work-order-participant.entity';
import { WorkOrder } from './database/entities/work-order.entity';
import { UsersModule } from './users/users.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqlite',
        database: config.get<string>('DATABASE_PATH', './data/autofix.sqlite'),
        autoLoadEntities: true,
        migrationsRun: true,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature([
      AuditLog,
      User,
      Vehicle,
      WorkOrder,
      WorkOrderItem,
      WorkOrderParticipant,
    ]),
    DatabaseSettingsModule,
    AuthModule,
    UsersModule,
    VehiclesModule,
    WorkOrdersModule,
  ],
})
export class AppModule {}

