import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Like, Repository } from 'typeorm';
import { Vehicle } from '../database/entities/vehicle.entity';
import { Actor, audit, isStockManager } from '../auth/actor';
import { WriteService } from '../database/write.service';

export interface VehicleInput {
  plateNumber: string;
  vin?: string;
  brand?: string;
  model?: string;
  customerName?: string;
  customerPhone?: string;
}

@Injectable()
export class VehiclesService {
  constructor(@InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>, private readonly writes: WriteService) {}

  findAll(actor: Actor, query?: string) {
    const q = this.vehicles.createQueryBuilder('v').where('v.isActive = 1');
    if (query) q.andWhere('(v.plateNumber LIKE :q OR v.vin LIKE :q OR v.customerName LIKE :q)', { q: `%${query}%` });
    if (!isStockManager(actor)) q.andWhere('(v.createdById = :id OR EXISTS(SELECT 1 FROM work_orders o WHERE o.vehicleId = v.id AND (o.createdById = :id OR EXISTS(SELECT 1 FROM work_order_participants p WHERE p.workOrderId = o.id AND p.userId = :id))))', { id: actor.id });
    return q.orderBy('v.updatedAt', 'DESC').getMany();
  }

  async create(actor: Actor, input: VehicleInput) {
    return this.writes.run(async (m) => {
      const vehicle = await m.save(Vehicle, m.create(Vehicle, { ...input, createdById: actor.id, plateNumber: input.plateNumber.trim().toUpperCase(), vin: input.vin?.trim().toUpperCase() }));
      await audit(m, actor, 'CREATE_VEHICLE', 'vehicle', vehicle.id);
      return vehicle;
    });
  }

  async update(actor: Actor, id: string, input: VehicleInput) {
    return this.writes.run(async (m) => {
      const vehicle = await m.findOneBy(Vehicle, { id, isActive: true });
      if (!vehicle) throw new NotFoundException('车辆不存在');
      Object.assign(vehicle, input);
      await m.save(vehicle);
      await audit(m, actor, 'UPDATE_VEHICLE', 'vehicle', id);
      return vehicle;
    });
  }
}

