import { Body, Controller, Get, Post, Put, Query, Param, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VehiclesService } from './vehicles.service';

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
  findAll(@Query('q') query?: string) {
    return this.vehicles.findAll(query);
  }

  @Post()
  create(@Body() dto: VehicleDto) {
    return this.vehicles.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<VehicleDto>) {
    return this.vehicles.update(id, dto);
  }
}

