import { ForbiddenException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditLog } from '../database/entities/audit-log.entity';
import { UserRole } from '../database/entities/user.entity';

export type Actor = { id: string; role: UserRole; name: string; username: string };
export type AuthRequest = { user: Actor };
export const isManager = (actor: Actor) => [UserRole.OWNER, UserRole.MANAGER].includes(actor.role);
export const isStockManager = (actor: Actor) => isManager(actor) || actor.role === UserRole.WAREHOUSE;
export function requireManager(actor: Actor) {
  if (!isManager(actor)) throw new ForbiddenException('仅老板和主管可执行此操作');
}
export function requireStockManager(actor: Actor) {
  if (!isStockManager(actor)) throw new ForbiddenException('仅仓管、主管和老板可执行此操作');
}
export function audit(manager: EntityManager, actor: Actor, action: string, resource: string, resourceId: string, metadata?: Record<string, unknown>) {
  return manager.save(AuditLog, manager.create(AuditLog, { actorId: actor.id, action, resource, resourceId, metadata }));
}
