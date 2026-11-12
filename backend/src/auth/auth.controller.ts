import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
class PasswordDto {
  @IsString() oldPassword!: string;
  @IsString() @MinLength(8) newPassword!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: { user: { id: string } }) {
    return request.user;
  }

  @UseGuards(JwtAuthGuard)
  @Post('password')
  password(@Req() request: { user: { id: string } }, @Body() dto: PasswordDto) {
    return this.auth.changePassword(request.user.id, dto.oldPassword, dto.newPassword);
  }
}

