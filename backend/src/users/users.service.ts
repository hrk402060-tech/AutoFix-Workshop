import { BadRequestException, Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Actor, audit, isManager, requireManager } from '../auth/actor';
import { WriteService } from '../database/write.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>, private readonly writes: WriteService) {}

  findAll(actor: Actor) {
    return this.users.find({ where: isManager(actor) ? {} : { id: actor.id }, order: { name: 'ASC' } });
  }
  async create(actor: Actor, input: Pick<User, 'username' | 'name' | 'role'> & { password: string }) {
    requireManager(actor);
    if (actor.role !== 'OWNER' && input.role !== 'EMPLOYEE') throw new BadRequestException('主管只能创建员工账号');
    const passwordHash = await bcrypt.hash(input.password, 10);
    return this.writes.run(async (m) => {
      if (await m.existsBy(User, { username: input.username })) throw new ConflictException('用户名已存在');
      const user = await m.save(User, m.create(User, { username: input.username, name: input.name, role: input.role, passwordHash }));
      await audit(m, actor, 'CREATE_USER', 'user', user.id);
      const { passwordHash: _, ...result } = user;
      return result;
    });
  }
  async setActive(actor: Actor, id: string, isActive: boolean) {
    requireManager(actor);
    if (id === actor.id) throw new BadRequestException('不能停用自己的账号');
    return this.writes.run(async (m) => {
      const user = await m.findOneByOrFail(User, { id });
      if (user.role === 'OWNER' || (actor.role !== 'OWNER' && user.role !== 'EMPLOYEE')) throw new BadRequestException('无权修改该账号');
      await m.update(User, id, { isActive });
      await audit(m, actor, isActive ? 'ENABLE_USER' : 'DISABLE_USER', 'user', id);
      return { success: true };
    });
  }

  findOne(id: string) {
    return this.users.findOneByOrFail({ id });
  }
}

