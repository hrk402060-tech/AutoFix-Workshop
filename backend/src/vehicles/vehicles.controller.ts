import { Body, Controller, Get, Post, Put, Query, Param, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VehiclesService } from './vehicles.service';
import { AuthRequest, requireManager } from '../auth/actor';

class VehicleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  plateNumber!: string;

  @IsOptional()
  @IsString()
  vin?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;
}

@Controller('vehicles')
@UseGuards(JwtAuthGuard)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  findAll(@Req() req: AuthRequest, @Query('q') query?: string) {
    return this.vehicles.findAll(req.user, query);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: VehicleDto) {
    if (req.user.role === 'WAREHOUSE') throw new ForbiddenException('仓管不能创建车辆');
    return this.vehicles.create(req.user, dto);
  }

  @Put(':id')
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: VehicleDto) {
    requireManager(req.user);
    return this.vehicles.update(req.user, id, dto);
  }
}

