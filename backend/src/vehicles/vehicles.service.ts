import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Like, Repository } from 'typeorm';
import { Vehicle } from '../database/entities/vehicle.entity';

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
  constructor(@InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>) {}

  findAll(query?: string) {
    if (!query) return this.vehicles.find({ where: { isActive: true }, order: { updatedAt: 'DESC' } });
    return this.vehicles.find({
      where: [
        { plateNumber: Like(`%${query}%`), isActive: true },
        { vin: Like(`%${query}%`), isActive: true },
      ],
      order: { updatedAt: 'DESC' },
    });
  }

  async create(input: VehicleInput) {
    const vehicle = this.vehicles.create({ id: randomUUID(), ...input });
    return this.vehicles.save(vehicle);
  }

  async update(id: string, input: Partial<VehicleInput>) {
    const vehicle = await this.vehicles.findOneBy({ id, isActive: true });
    if (!vehicle) throw new NotFoundException('车辆不存在');
    Object.assign(vehicle, input);
    return this.vehicles.save(vehicle);
  }
}

