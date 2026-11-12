import { Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Module({})
export class DatabaseSettingsModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query('PRAGMA journal_mode = WAL');
    await this.dataSource.query('PRAGMA foreign_keys = ON');
    await this.dataSource.query('PRAGMA busy_timeout = 5000');
  }
}

