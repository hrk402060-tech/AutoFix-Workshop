import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { AuditLog } from '../database/entities/audit-log.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { WorkOrderItem } from '../database/entities/work-order-item.entity';
import { WorkOrderParticipant } from '../database/entities/work-order-participant.entity';
import { WorkOrder, WorkOrderStatus } from '../database/entities/work-order.entity';

export interface WorkOrderInput {
  vehicleId: string;
  customerRequest: string;
  itemTitles: string[];
  participantIds?: string[];
}

@Injectable()
export class WorkOrdersService {
  constructor(
    @InjectRepository(WorkOrder) private readonly orders: Repository<WorkOrder>,
    @InjectRepository(WorkOrderItem) private readonly items: Repository<WorkOrderItem>,
    @InjectRepository(WorkOrderParticipant) private readonly participants: Repository<WorkOrderParticipant>,
    @InjectRepository(Vehicle) private readonly vehicles: Repository<Vehicle>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
  ) {}

  private async audit(actorId: string, action: string, resourceId: string, metadata?: Record<string, unknown>) {
    await this.logs.save(this.logs.create({ id: randomUUID(), actorId, action, resource: 'work_order', resourceId, metadata }));
  }

  async list(actor: { id: string; role: UserRole }) {
    const query = this.orders.createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'item')
      .leftJoinAndSelect('order.participants', 'participant')
      .leftJoinAndMapOne('order.vehicle', Vehicle, 'vehicle', 'vehicle.id = order.vehicleId')
      .orderBy('order.createdAt', 'DESC');
    if (![UserRole.OWNER, UserRole.MANAGER, UserRole.WAREHOUSE].includes(actor.role)) {
      query.andWhere('(order.createdById = :id OR participant.userId = :id)', { id: actor.id });
    }
    return query.getMany();
  }

  async create(actor: { id: string }, input: WorkOrderInput) {
    const vehicle = await this.vehicles.findOneBy({ id: input.vehicleId, isActive: true });
    if (!vehicle) throw new NotFoundException('车辆不存在');
    const order = this.orders.create({
      id: randomUUID(),
      orderNo: `WO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.floor(Math.random() * 9000 + 1000)}`,
      vehicleId: input.vehicleId,
      createdById: actor.id,
      customerRequest: input.customerRequest,
      status: WorkOrderStatus.PENDING,
    });
    await this.orders.save(order);
    const itemEntities = (input.itemTitles || []).filter(Boolean).map((title) => this.items.create({ id: randomUUID(), workOrderId: order.id, title }));
    if (itemEntities.length) await this.items.save(itemEntities);
    const userIds = Array.from(new Set([actor.id, ...(input.participantIds || [])]));
    const validUsers = await this.users.findByIds(userIds);
    await this.participants.save(validUsers.map((user) => this.participants.create({ id: randomUUID(), workOrderId: order.id, userId: user.id })));
    await this.audit(actor.id, 'CREATE', order.id, { vehicleId: input.vehicleId });
    return this.getOne(order.id);
  }

  async getOne(id: string) {
    const order = await this.orders.findOne({ where: { id }, relations: { items: true, participants: { user: true } } });
    if (!order) throw new NotFoundException('工单不存在');
    return order;
  }

  async updateStatus(actor: { id: string; role: UserRole }, id: string, status: WorkOrderStatus, note?: string) {
    const order = await this.getOne(id);
    const canManage = [UserRole.OWNER, UserRole.MANAGER].includes(actor.role);
    const isParticipant = order.createdById === actor.id || order.participants.some((participant) => participant.userId === actor.id);
    if (!canManage && !isParticipant) throw new ForbiddenException('无权操作此工单');
    order.status = status;
    if (note !== undefined) order.acceptanceNote = note;
    await this.orders.save(order);
    await this.audit(actor.id, `STATUS_${status}`, id, { note });
    return this.getOne(id);
  }
}

