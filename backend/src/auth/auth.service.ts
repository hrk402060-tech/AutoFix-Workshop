import { Injectable, OnModuleInit, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User, UserRole } from '../database/entities/user.entity';
import { WriteService } from '../database/write.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly writes: WriteService,
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
      passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10),
    });
    await this.users.save(admin);
  }

  async resolveUser(id: string) {
    const user = await this.users.findOneBy({ id, isActive: true });
    if (!user) throw new UnauthorizedException('账号已停用或不存在');
    return this.publicUser(user);
  }

  async changePassword(id: string, oldPassword: string, newPassword: string) {
    const user = await this.users.createQueryBuilder('u').addSelect('u.passwordHash').where('u.id = :id', { id }).getOneOrFail();
    if (!(await bcrypt.compare(oldPassword, user.passwordHash))) throw new BadRequestException('原密码不正确');
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.writes.run((manager) => manager.update(User, id, { passwordHash }));
    return { success: true };
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

