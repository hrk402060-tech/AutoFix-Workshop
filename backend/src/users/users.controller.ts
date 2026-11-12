import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { AuthRequest } from '../auth/actor';
import { UserRole } from '../database/entities/user.entity';
import { IsBoolean, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';

class CreateUserDto {
  @IsString() @Matches(/^[a-zA-Z0-9_-]{3,50}$/) username!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsString() @MinLength(8) @MaxLength(72) password!: string;
  @IsEnum(UserRole) role!: UserRole;
}
class ActiveDto { @IsBoolean() isActive!: boolean; }

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(@Req() req: AuthRequest) {
    return this.users.findAll(req.user);
  }
  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateUserDto) { return this.users.create(req.user, dto); }
  @Patch(':id/active')
  active(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: ActiveDto) { return this.users.setActive(req.user, id, dto.isActive); }
}

