import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findAll() {
    return this.users.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  findOne(id: string) {
    return this.users.findOneByOrFail({ id });
  }
}

