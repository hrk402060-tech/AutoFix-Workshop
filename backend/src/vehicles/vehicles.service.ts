import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Vehicle } from '../database/entities/vehicle.entity';
import { Actor, audit, isStockManager } from '../auth/actor';
import { WriteService } from '../database/write.service';

export interface VehicleInput {
  plateNumber?: string;
  vin?: string;
  brand?: string;
  model?: string;
  customerName?: string;
  customerPhone?: string;
}

@Injectable()
export class VehiclesService {
  constructor(@InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>, private readonly writes: WriteService) {}

  private identity(input: VehicleInput) {
    const plateNumber = input.plateNumber?.trim().toUpperCase() || '';
    const vin = input.vin?.trim().toUpperCase() || '';
    if (!plateNumber && !vin) throw new BadRequestException('车牌号或 VIN 至少填写一项');
    if (plateNumber && plateNumber.length < 2) throw new BadRequestException('车牌号至少填写 2 个字符');
    return { plateNumber, vin };
  }

  findAll(actor: Actor, query?: string) {
    const q = this.vehicles.createQueryBuilder('v').where('v.isActive = 1');
    if (query) q.andWhere('(v.plateNumber LIKE :q OR v.vin LIKE :q OR v.customerName LIKE :q)', { q: `%${query}%` });
    if (!isStockManager(actor)) q.andWhere('(v.createdById = :id OR EXISTS(SELECT 1 FROM work_orders o WHERE o.vehicleId = v.id AND (o.createdById = :id OR EXISTS(SELECT 1 FROM work_order_participants p WHERE p.workOrderId = o.id AND p.userId = :id))))', { id: actor.id });
    return q.orderBy('v.updatedAt', 'DESC').getMany();
  }

  async create(actor: Actor, input: VehicleInput) {
    const identity = this.identity(input);
    return this.writes.run(async (m) => {
      const vehicle = await m.save(Vehicle, m.create(Vehicle, { ...input, ...identity, createdById: actor.id }));
      await audit(m, actor, 'CREATE_VEHICLE', 'vehicle', vehicle.id);
      return vehicle;
    });
  }

  async update(actor: Actor, id: string, input: VehicleInput) {
    const identity = this.identity(input);
    return this.writes.run(async (m) => {
      const vehicle = await m.findOneBy(Vehicle, { id, isActive: true });
      if (!vehicle) throw new NotFoundException('车辆不存在');
      Object.assign(vehicle, input, identity);
      await m.save(vehicle);
      await audit(m, actor, 'UPDATE_VEHICLE', 'vehicle', id);
      return vehicle;
    });
  }
}

