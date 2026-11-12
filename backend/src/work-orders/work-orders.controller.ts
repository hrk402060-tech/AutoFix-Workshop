import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayMinSize, ArrayMaxSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength, IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthRequest } from '../auth/actor';
import { WorkOrderStatus } from '../database/entities/work-order.entity';
import { WorkOrdersService } from './work-orders.service';

class CreateWorkOrderDto {
  @IsUUID()
  vehicleId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  customerRequest!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(120, { each: true })
  itemTitles!: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  participantIds?: string[];
}

class UpdateStatusDto {
  @IsEnum(WorkOrderStatus)
  status!: WorkOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
class AssignDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(15) @IsUUID('4', { each: true }) participantIds!: string[];
}
class RecordDto {
  @IsString() @MinLength(2) @MaxLength(4000) note!: string;
}

@Controller('work-orders')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly orders: WorkOrdersService) {}

  @Get()
  list(@Req() request: AuthRequest) {
    return this.orders.list(request.user);
  }

  @Get(':id')
  getOne(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.orders.getOne(request.user, id);
  }

  @Post()
  create(@Req() request: AuthRequest, @Body() dto: CreateWorkOrderDto) {
    return this.orders.create(request.user, dto);
  }

  @Patch(':id/status')
  updateStatus(@Req() request: AuthRequest, @Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.orders.updateStatus(request.user, id, dto.status, dto.note);
  }
  @Patch(':id/participants')
  assign(@Req() request: AuthRequest, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.orders.assign(request.user, id, dto.participantIds);
  }
  @Post(':id/records')
  record(@Req() request: AuthRequest, @Param('id') id: string, @Body() dto: RecordDto) {
    return this.orders.record(request.user, id, dto.note);
  }
}

