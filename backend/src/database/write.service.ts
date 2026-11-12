import { Global, Injectable, Module } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

// One SQLite connection cannot interleave transactions from parallel requests.
@Injectable()
export class WriteService {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly db: DataSource) {}

  run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    const result = this.tail.then(() => this.db.transaction(work));
    this.tail = result.catch(() => undefined);
    return result;
  }
}

@Global()
@Module({ providers: [WriteService], exports: [WriteService] })
export class WriteModule {}
