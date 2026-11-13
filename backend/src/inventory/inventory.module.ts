import { BadRequestException, Body, ConflictException, Controller, Get, Module, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { Actor, AuthRequest, audit, isManager, isStockManager, requireManager, requireStockManager } from '../auth/actor';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MaterialRequest, Part, StockTransaction } from '../database/business.entity';
import { WriteService } from '../database/write.service';
import { WorkOrder } from '../database/entities/work-order.entity';
import { User } from '../database/entities/user.entity';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { WorkOrdersService } from '../work-orders/work-orders.service';

class PartDto {
  @IsString() @MinLength(1) @MaxLength(50) code!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @MaxLength(100) specification!: string;
  @IsString() @MinLength(1) @MaxLength(20) unit!: string;
}
class IncomingDto {
  @IsUUID() partId!: string;
  @IsInt() @Min(1) @Max(100000) quantity!: number;
  @IsString() @MinLength(2) @MaxLength(500) note!: string;
}
class RequestDto extends IncomingDto {
  @IsUUID() workOrderId!: string;
  @IsEnum({ OUT: 'OUT', RETURN: 'RETURN' }) type!: 'OUT' | 'RETURN';
}
class ReviewDto {
  @IsEnum({ APPROVED: 'APPROVED', REJECTED: 'REJECTED' }) status!: 'APPROVED' | 'REJECTED';
}
class PartListDto {
  @IsOptional() @IsEnum({ active: 'active', inactive: 'inactive', all: 'all' }) parts?: 'active' | 'inactive' | 'all';
}
class PartActiveDto {
  @IsBoolean() isActive!: boolean;
  @IsString() @MaxLength(500) note!: string;
}
class StockOutDto extends IncomingDto {
  @IsEnum({ PURCHASE_RETURN: 'PURCHASE_RETURN', SCRAP: 'SCRAP' }) type!: 'PURCHASE_RETURN' | 'SCRAP';
  @IsUUID('4') operationId!: string;
}

@Injectable()
class InventoryService {
  constructor(private readonly db: DataSource, private readonly writes: WriteService, private readonly orders: WorkOrdersService) {}
  private reason(note: string) {
    const value = note.trim();
    if ([...value].length < 2) throw new BadRequestException('原因至少填写 2 个字符');
    return value;
  }

  async list(actor: Actor, filter: 'active' | 'inactive' | 'all' = 'active') {
    if (filter !== 'active') requireManager(actor);
    const parts = await this.db.manager.find(Part, {
      where: filter === 'all' ? {} : { isActive: filter === 'active' }, order: { code: 'ASC' },
    });
    const pending = isManager(actor) ? await this.db.manager.find(MaterialRequest, { where: { status: 'PENDING' }, select: ['partId'] }) : [];
    const pendingIds = new Set(pending.map((request) => request.partId));
    const requests = await this.db.manager.find(MaterialRequest, { where: isStockManager(actor) ? {} : { applicantId: actor.id }, order: { createdAt: 'DESC' } });
    const orderIds = [...new Set(requests.map((request) => request.workOrderId))];
    const orders = orderIds.length ? await this.db.manager.find(WorkOrder, { where: { id: In(orderIds) }, select: ['id', 'status'] }) : [];
    const statuses = new Map(orders.map((order) => [order.id, order.status]));
    const transactions = isStockManager(actor) ? await this.db.manager.find(StockTransaction, { order: { createdAt: 'DESC' }, take: 200 }) : [];
    const historyIds = [...new Set([...requests, ...transactions].map((row) => row.partId))];
    const historyParts = historyIds.length ? await this.db.manager.find(Part, { where: { id: In(historyIds) } }) : [];
    const names = new Map(historyParts.map((part) => [part.id, part]));
    const actorIds = [...new Set(transactions.map((transaction) => transaction.actorId))];
    const actors = actorIds.length ? await this.db.manager.find(User, { where: { id: In(actorIds) }, select: ['id', 'name'] }) : [];
    const actorNames = new Map(actors.map((user) => [user.id, user.name]));
    const historyName = (partId: string) => ({ partName: names.get(partId)?.name, partCode: names.get(partId)?.code });
    return {
      parts: parts.map((part) => ({ ...part, ...(isManager(actor) ? { hasPendingRequests: pendingIds.has(part.id) } : {}) })),
      requests: requests.map((request) => ({ ...request, ...historyName(request.partId), partActive: names.get(request.partId)?.isActive, workOrderStatus: statuses.get(request.workOrderId) })),
      transactions: transactions.map((transaction) => ({ ...transaction, ...historyName(transaction.partId), actorName: actorNames.get(transaction.actorId) || '历史账号' })),
    };
  }

  async active(actor: Actor, id: string, dto: PartActiveDto) {
    requireManager(actor);
    const note = this.reason(dto.note);
    return this.writes.run(async (m) => {
      const part = await m.findOneBy(Part, { id });
      if (!part) throw new BadRequestException('零件不存在');
      if (part.isActive === dto.isActive) throw new BadRequestException(dto.isActive ? '零件已在使用中' : '零件已归档');
      if (!dto.isActive) {
        if (await m.existsBy(MaterialRequest, { partId: id, status: 'PENDING' })) throw new BadRequestException('请先处理待审批领料/退料申请');
        if (part.quantity !== 0) throw new BadRequestException('库存非零，不可归档，请先采购退货或报废出库');
      }
      await m.update(Part, id, { isActive: dto.isActive });
      await audit(m, actor, dto.isActive ? 'RESTORE_PART' : 'ARCHIVE_PART', 'part', id, { code: part.code, note });
      return { ...part, isActive: dto.isActive };
    });
  }

  private async decrement(m: EntityManager, partId: string, quantity: number) {
    const result = await m.createQueryBuilder().update(Part)
      .set({ quantity: () => 'quantity - :quantity' })
      .where('id = :partId AND isActive = 1 AND quantity >= :quantity', { partId, quantity }).execute();
    if (result.affected !== 1) throw new BadRequestException('零件已归档或可用库存不足');
  }

  async outgoing(actor: Actor, dto: StockOutDto) {
    requireStockManager(actor);
    const note = this.reason(dto.note);
    return this.writes.run(async (m) => {
      const existing = await m.findOneBy(StockTransaction, { operationId: dto.operationId });
      if (existing) {
        if (existing.actorId !== actor.id || existing.partId !== dto.partId || existing.quantity !== dto.quantity || existing.type !== dto.type || existing.note !== note) {
          throw new ConflictException('操作编号已用于其他出库，请刷新后重试');
        }
        return existing;
      }
      if (!await m.existsBy(Part, { id: dto.partId, isActive: true })) throw new BadRequestException('零件不存在或已归档');
      await this.decrement(m, dto.partId, dto.quantity);
      const transaction = await m.save(StockTransaction, m.create(StockTransaction, {
        partId: dto.partId, quantity: dto.quantity, type: dto.type, note, operationId: dto.operationId, actorId: actor.id,
      }));
      await audit(m, actor, `STOCK_${dto.type}`, 'part', dto.partId, { quantity: dto.quantity, note, transactionId: transaction.id, operationId: dto.operationId });
      return transaction;
    });
  }
  async part(actor: Actor, dto: PartDto) {
    requireStockManager(actor);
    return this.writes.run(async (m) => {
      if (await m.existsBy(Part, { code: dto.code })) throw new BadRequestException('零件编号已存在');
      const part = await m.save(Part, m.create(Part, { ...dto, quantity: 0 }));
      await audit(m, actor, 'CREATE_PART', 'part', part.id);
      return part;
    });
  }
  async incoming(actor: Actor, dto: IncomingDto) {
    requireStockManager(actor);
    return this.writes.run(async (m) => {
      const part = await m.findOneBy(Part, { id: dto.partId, isActive: true });
      if (!part) throw new BadRequestException('零件不存在或已归档');
      await m.increment(Part, { id: part.id }, 'quantity', dto.quantity);
      const transaction = await m.save(StockTransaction, m.create(StockTransaction, { ...dto, actorId: actor.id, type: 'IN' }));
      await audit(m, actor, 'STOCK_IN', 'part', part.id, { quantity: dto.quantity, transactionId: transaction.id });
      return transaction;
    });
  }
  async request(actor: Actor, dto: RequestDto) {
    return this.writes.run(async (m) => {
      await this.orders.editable(actor, dto.workOrderId, m);
      if (!await m.existsBy(Part, { id: dto.partId, isActive: true })) throw new BadRequestException('零件不存在或已归档');
      const request = await m.save(MaterialRequest, m.create(MaterialRequest, { ...dto, applicantId: actor.id, status: 'PENDING' }));
      await audit(m, actor, `REQUEST_${dto.type}`, 'work_order', dto.workOrderId, { requestId: request.id });
      return request;
    });
  }
  async review(actor: Actor, id: string, status: 'APPROVED' | 'REJECTED') {
    requireStockManager(actor);
    return this.writes.run(async (m) => {
      const request = await m.findOneBy(MaterialRequest, { id });
      if (!request) throw new BadRequestException('申请不存在');
      const order = await this.orders.accessible(actor, request.workOrderId, m);
      if (order.status === 'CANCELLED') throw new BadRequestException('工单已作废，不可审批物料申请');
      if (request.status !== 'PENDING') throw new BadRequestException('申请已处理，请刷新');
      const part = await m.findOneByOrFail(Part, { id: request.partId });
      if (!part.isActive) throw new BadRequestException('零件已归档，不可审批');
      if (status === 'APPROVED') {
        if (['COMPLETED', 'CANCELLED'].includes(order.status)) throw new BadRequestException('工单已结束，不能批准物料变动');
        if (request.type === 'OUT' && part.quantity < request.quantity) throw new BadRequestException('库存不足，无法出库');
        if (request.type === 'RETURN') {
          const approved = await m.find(MaterialRequest, { where: { workOrderId: request.workOrderId, partId: request.partId, applicantId: request.applicantId, status: 'APPROVED' } });
          const outstanding = approved.reduce((total, r) => total + (r.type === 'OUT' ? r.quantity : -r.quantity), 0);
          if (request.quantity > outstanding) throw new BadRequestException('退料数量超过本人在该工单的已领未退数量');
        }
        if (request.type === 'OUT') await this.decrement(m, part.id, request.quantity);
        else await m.increment(Part, { id: part.id }, 'quantity', request.quantity);
        await m.save(StockTransaction, m.create(StockTransaction, { partId: part.id, actorId: actor.id, type: request.type, quantity: request.quantity, note: request.note, requestId: id }));
      }
      await m.update(MaterialRequest, id, { status, reviewerId: actor.id });
      await audit(m, actor, `MATERIAL_${status}`, 'work_order', request.workOrderId, { requestId: id });
      return { success: true };
    });
  }
}

@Controller('inventory')
@UseGuards(JwtAuthGuard)
class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get() list(@Req() r: AuthRequest, @Query() query: PartListDto) { return this.service.list(r.user, query.parts); }
  @Post('parts') part(@Req() r: AuthRequest, @Body() dto: PartDto) { return this.service.part(r.user, dto); }
  @Patch('parts/:id/active') active(@Req() r: AuthRequest, @Param('id') id: string, @Body() dto: PartActiveDto) { return this.service.active(r.user, id, dto); }
  @Post('incoming') incoming(@Req() r: AuthRequest, @Body() dto: IncomingDto) { return this.service.incoming(r.user, dto); }
  @Post('outgoing') outgoing(@Req() r: AuthRequest, @Body() dto: StockOutDto) { return this.service.outgoing(r.user, dto); }
  @Post('requests') request(@Req() r: AuthRequest, @Body() dto: RequestDto) { return this.service.request(r.user, dto); }
  @Post('requests/:id/review') review(@Req() r: AuthRequest, @Param('id') id: string, @Body() dto: ReviewDto) { return this.service.review(r.user, id, dto.status); }
}

@Module({ imports: [WorkOrdersModule], controllers: [InventoryController], providers: [InventoryService] })
export class InventoryModule {}
