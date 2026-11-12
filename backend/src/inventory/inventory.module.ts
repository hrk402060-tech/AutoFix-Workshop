import { BadRequestException, Body, Controller, Get, Module, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayNotEmpty, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Actor, AuthRequest, audit, isStockManager, requireStockManager } from '../auth/actor';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MaterialRequest, Part, StockTransaction } from '../database/business.entity';
import { WriteService } from '../database/write.service';
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

@Injectable()
class InventoryService {
  constructor(private readonly db: DataSource, private readonly writes: WriteService, private readonly orders: WorkOrdersService) {}
  async list(actor: Actor) {
    const parts = await this.db.manager.find(Part, { order: { code: 'ASC' } });
    const requests = await this.db.manager.find(MaterialRequest, { where: isStockManager(actor) ? {} : { applicantId: actor.id }, order: { createdAt: 'DESC' } });
    const transactions = isStockManager(actor) ? await this.db.manager.find(StockTransaction, { order: { createdAt: 'DESC' }, take: 200 }) : [];
    return { parts, requests, transactions };
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
      if (!part) throw new BadRequestException('零件不存在');
      await m.increment(Part, { id: part.id }, 'quantity', dto.quantity);
      const transaction = await m.save(StockTransaction, m.create(StockTransaction, { ...dto, actorId: actor.id, type: 'IN' }));
      await audit(m, actor, 'STOCK_IN', 'part', part.id, { quantity: dto.quantity, transactionId: transaction.id });
      return transaction;
    });
  }
  async request(actor: Actor, dto: RequestDto) {
    return this.writes.run(async (m) => {
      await this.orders.editable(actor, dto.workOrderId, m);
      if (!await m.existsBy(Part, { id: dto.partId, isActive: true })) throw new BadRequestException('零件不存在');
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
      if (request.status !== 'PENDING') throw new BadRequestException('申请已处理，请刷新');
      const part = await m.findOneByOrFail(Part, { id: request.partId });
      if (status === 'APPROVED') {
        const order = await this.orders.accessible(actor, request.workOrderId, m);
        if (['COMPLETED', 'CANCELLED'].includes(order.status)) throw new BadRequestException('工单已结束，不能批准物料变动');
        if (request.type === 'OUT' && part.quantity < request.quantity) throw new BadRequestException('库存不足，无法出库');
        if (request.type === 'RETURN') {
          const approved = await m.find(MaterialRequest, { where: { workOrderId: request.workOrderId, partId: request.partId, applicantId: request.applicantId, status: 'APPROVED' } });
          const outstanding = approved.reduce((total, r) => total + (r.type === 'OUT' ? r.quantity : -r.quantity), 0);
          if (request.quantity > outstanding) throw new BadRequestException('退料数量超过本人在该工单的已领未退数量');
        }
        await m.increment(Part, { id: part.id }, 'quantity', request.type === 'OUT' ? -request.quantity : request.quantity);
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
  @Get() list(@Req() r: AuthRequest) { return this.service.list(r.user); }
  @Post('parts') part(@Req() r: AuthRequest, @Body() dto: PartDto) { return this.service.part(r.user, dto); }
  @Post('incoming') incoming(@Req() r: AuthRequest, @Body() dto: IncomingDto) { return this.service.incoming(r.user, dto); }
  @Post('requests') request(@Req() r: AuthRequest, @Body() dto: RequestDto) { return this.service.request(r.user, dto); }
  @Post('requests/:id/review') review(@Req() r: AuthRequest, @Param('id') id: string, @Body() dto: ReviewDto) { return this.service.review(r.user, id, dto.status); }
}

@Module({ imports: [WorkOrdersModule], controllers: [InventoryController], providers: [InventoryService] })
export class InventoryModule {}
