import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '../database/entities/user.entity';
import { WorkOrderStatus } from '../database/entities/work-order.entity';
import { WorkOrdersService } from './work-orders.service';

class CreateWorkOrderDto {
  @IsString()
  vehicleId!: string;

  @IsString()
  @MinLength(2)
  customerRequest!: string;

  @IsArray()
  @IsString({ each: true })
  itemTitles!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participantIds?: string[];
}

class UpdateStatusDto {
  @IsEnum(WorkOrderStatus)
  status!: WorkOrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly orders: WorkOrdersService) {}

  @Get()
  list(@Req() request: { user: { id: string; role: UserRole } }) {
    return this.orders.list(request.user);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.orders.getOne(id);
  }

  @Post()
  create(@Req() request: { user: { id: string } }, @Body() dto: CreateWorkOrderDto) {
    return this.orders.create(request.user, dto);
  }

  @Patch(':id/status')
  updateStatus(@Req() request: { user: { id: string; role: UserRole } }, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.orders.updateStatus(request.user, id, dto.status, dto.note);
  }
}

