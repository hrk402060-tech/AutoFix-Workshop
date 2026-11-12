import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User, UserRole } from '../database/entities/user.entity';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

  async ensureDefaultAdmin() {
    const count = await this.users.count();
    if (count > 0) return;
    const admin = this.users.create({
      username: 'admin',
      name: '系统管理员',
      role: UserRole.OWNER,
      passwordHash: await bcrypt.hash('Admin@123', 10),
    });
    await this.users.save(admin);
  }

  async login(username: string, password: string) {
    const user = await this.users.createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username AND user.isActive = 1', { username })
      .getOne();
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, username: user.username, role: user.role }),
      user: this.publicUser(user),
    };
  }

  publicUser(user: User) {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}

