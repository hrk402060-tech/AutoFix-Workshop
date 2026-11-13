import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Actor, audit, isManager, isStockManager, requireManager } from '../auth/actor';
import { WriteService } from '../database/write.service';
import { AuditLog } from '../database/entities/audit-log.entity';
import { RepairRecord, Photo, MaterialRequest } from '../database/business.entity';
import { User, UserRole } from '../database/entities/user.entity';
import { Vehicle } from '../database/entities/vehicle.entity';
import { WorkOrderItem } from '../database/entities/work-order-item.entity';
import { WorkOrderParticipant } from '../database/entities/work-order-participant.entity';
import { WorkOrder, WorkOrderStatus as S } from '../database/entities/work-order.entity';

export interface WorkOrderInput {
  vehicleId: string;
  customerRequest: string;
  itemTitles: string[];
  participantIds?: string[];
}

@Injectable()
export class WorkOrdersService {
  constructor(private readonly db: DataSource, private readonly writes: WriteService) {}

  async accessible(actor: Actor, id: string, manager = this.db.manager) {
    const order = await manager.findOne(WorkOrder, { where: { id }, relations: { items: true, participants: { user: true } } });
    if (!order) throw new NotFoundException('工单不存在');
    if (!isStockManager(actor) && order.createdById !== actor.id && !order.participants.some((p) => p.userId === actor.id)) {
      throw new ForbiddenException('无权查看此工单');
    }
    return order;
  }

  async editable(actor: Actor, id: string, manager = this.db.manager) {
    const order = await this.accessible(actor, id, manager);
    if (actor.role === UserRole.WAREHOUSE) throw new ForbiddenException('仓管不能修改维修工单');
    if ([S.COMPLETED, S.CANCELLED].includes(order.status)) throw new BadRequestException('已完成或已作废的工单不可修改');
    return order;
  }

  async list(actor: Actor, status?: S) {
    if (status === S.CANCELLED) requireManager(actor);
    const query = this.db.getRepository(WorkOrder).createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'item')
      .leftJoinAndSelect('o.participants', 'p')
      .leftJoinAndSelect('p.user', 'u')
      .leftJoinAndMapOne('o.vehicle', Vehicle, 'v', 'v.id = o.vehicleId')
      .orderBy('o.createdAt', 'DESC');
    if (status) query.andWhere('o.status = :status', { status });
    else query.andWhere('o.status != :cancelled', { cancelled: S.CANCELLED });
    if (!isStockManager(actor)) {
      query.andWhere('(o.createdById = :id OR EXISTS(SELECT 1 FROM work_order_participants member WHERE member.workOrderId = o.id AND member.userId = :id))', { id: actor.id });
    }
    return query.getMany();
  }

  async getOne(actor: Actor, id: string) {
    const order = await this.accessible(actor, id);
    const records = await this.db.manager.find(RepairRecord, { where: { workOrderId: id }, order: { createdAt: 'ASC' } });
    const logs = await this.db.manager.find(AuditLog, { where: { resource: 'work_order', resourceId: id }, order: { createdAt: 'ASC' } });
    const authorIds = [...new Set([...records.map((r) => r.authorId), ...logs.map((l) => l.actorId)])];
    const authors = authorIds.length ? await this.db.manager.find(User, { where: { id: In(authorIds) }, select: ['id', 'name'] }) : [];
    const names = new Map(authors.map((u) => [u.id, u.name]));
    return {
      ...order,
      vehicle: await this.db.manager.findOneBy(Vehicle, { id: order.vehicleId }),
      records: records.map((r) => ({ ...r, authorName: names.get(r.authorId) || '历史账号' })),
      photos: await this.db.manager.find(Photo, { where: { workOrderId: id }, order: { createdAt: 'ASC' }, select: ['id', 'stage', 'authorId', 'createdAt', 'size'] }),
      logs: logs.map((l) => ({ ...l, actorName: names.get(l.actorId) || '历史账号' })),
    };
  }

  private async members(manager: EntityManager, ids: string[]) {
    if (!ids.length) return [];
    const users = await manager.find(User, { where: { id: In(ids), isActive: true } });
    if (users.length !== ids.length || users.some((u) => u.role === UserRole.WAREHOUSE)) {
      throw new BadRequestException('参与人员必须为有效维修账号');
    }
    return users;
  }

  async create(actor: Actor, input: WorkOrderInput) {
    if (actor.role === UserRole.WAREHOUSE) throw new ForbiddenException('仓管不能接车建单');
    if (!isManager(actor) && input.participantIds?.some((id) => id !== actor.id)) throw new ForbiddenException('员工不能分配其他人员');
    const id = await this.writes.run(async (m) => {
      const vehicle = await m.findOneBy(Vehicle, { id: input.vehicleId, isActive: true });
      if (!vehicle) throw new NotFoundException('车辆不存在');
      if (!isStockManager(actor) && vehicle.createdById !== actor.id) {
        const related = await m.query('SELECT 1 FROM work_orders o WHERE o.vehicleId = ? AND (o.createdById = ? OR EXISTS(SELECT 1 FROM work_order_participants p WHERE p.workOrderId = o.id AND p.userId = ?)) LIMIT 1', [vehicle.id, actor.id, actor.id]);
        if (!related.length) throw new ForbiddenException('无权为该车辆建单');
      }
      const ids = Array.from(new Set(input.participantIds?.length ? input.participantIds : [actor.id]));
      await this.members(m, ids);
      const order = await m.save(WorkOrder, m.create(WorkOrder, {
        orderNo: `WO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
        vehicleId: input.vehicleId, createdById: actor.id, customerRequest: input.customerRequest, status: S.PENDING,
      }));
      await m.save(WorkOrderItem, input.itemTitles.map((title) => m.create(WorkOrderItem, { workOrderId: order.id, title })));
      await m.save(WorkOrderParticipant, ids.map((userId) => m.create(WorkOrderParticipant, { workOrderId: order.id, userId })));
      await audit(m, actor, 'CREATE', 'work_order', order.id);
      return order.id;
    });
    return this.getOne(actor, id);
  }

  async assign(actor: Actor, id: string, participantIds: string[]) {
    requireManager(actor);
    await this.writes.run(async (m) => {
      const order = await this.editable(actor, id, m);
      if (![S.PENDING, S.REPAIRING, S.REWORKING].includes(order.status)) throw new BadRequestException('待验收工单不可重新分配');
      const ids = [...new Set(participantIds)];
      if (!ids.length) throw new BadRequestException('至少选择一名参与人员');
      await this.members(m, ids);
      const existing = order.participants.map((p) => p.userId);
      for (const userId of existing.filter((userId) => !ids.includes(userId))) {
        await m.delete(WorkOrderParticipant, { workOrderId: id, userId });
      }
      await m.save(WorkOrderParticipant, ids.filter((userId) => !existing.includes(userId)).map((userId) => m.create(WorkOrderParticipant, { workOrderId: id, userId })));
      await audit(m, actor, 'ASSIGN', 'work_order', id, { participantIds: ids });
    });
    return this.getOne(actor, id);
  }

  async record(actor: Actor, id: string, note: string) {
    await this.writes.run(async (m) => {
      await this.editable(actor, id, m);
      await m.save(RepairRecord, m.create(RepairRecord, { workOrderId: id, authorId: actor.id, note }));
      await audit(m, actor, 'REPAIR_RECORD', 'work_order', id);
    });
    return this.getOne(actor, id);
  }

  async updateStatus(actor: Actor, id: string, status: S, note?: string) {
    if (status === S.CANCELLED) requireManager(actor);
    await this.writes.run(async (m) => {
      const order = status === S.CANCELLED
        ? await this.accessible(actor, id, m)
        : await this.editable(actor, id, m);
      const reason = note?.trim();
      if (status === S.CANCELLED) {
        if (order.status === S.CANCELLED) throw new BadRequestException('工单已作废，不可重复操作');
        if (!reason || [...reason].length < 2) throw new BadRequestException('作废原因至少填写 2 个字符');
        if (await m.existsBy(MaterialRequest, { workOrderId: id, status: 'PENDING' })) {
          throw new BadRequestException('请先批准或拒绝该工单的待审批领料/退料申请，再作废工单');
        }
        await m.save(RepairRecord, m.create(RepairRecord, {
          workOrderId: id, authorId: actor.id, note: `工单作废：${reason}`,
        }));
      } else {
        const transitions: Partial<Record<S, S[]>> = {
          [S.PENDING]: [S.REPAIRING],
          [S.REPAIRING]: [S.WAITING_ACCEPTANCE],
          [S.REWORKING]: [S.WAITING_ACCEPTANCE],
          [S.WAITING_ACCEPTANCE]: [S.COMPLETED, S.REWORKING],
        };
        if (!transitions[order.status]?.includes(status)) throw new BadRequestException('当前状态不允许此操作');
        if ([S.COMPLETED, S.REWORKING].includes(status)) requireManager(actor);
        if (status === S.REWORKING && !reason) throw new BadRequestException('请填写返工原因');
        if (status === S.WAITING_ACCEPTANCE && !await m.countBy(RepairRecord, { workOrderId: id })) throw new BadRequestException('请先填写维修记录');
        if (status === S.COMPLETED && await m.countBy(MaterialRequest, { workOrderId: id, status: 'PENDING' })) throw new BadRequestException('请先处理该工单的待审批物料申请');
      }
      await m.update(WorkOrder, id, { status, ...(reason ? { acceptanceNote: reason } : {}) });
      await audit(m, actor, `STATUS_${status}`, 'work_order', id, { from: order.status, note: reason });
    });
    return this.getOne(actor, id);
  }
}

