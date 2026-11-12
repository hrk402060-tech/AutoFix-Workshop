import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FastifyReply } from 'fastify';
import { Actor, AuthRequest, audit } from '../auth/actor';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Photo } from '../database/business.entity';
import { WriteService } from '../database/write.service';
import { WorkOrdersModule } from '../work-orders/work-orders.module';
import { WorkOrdersService } from '../work-orders/work-orders.service';

@Injectable()
class PhotosService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly orders: WorkOrdersService, private readonly writes: WriteService) {}
  private root() { return resolve(this.config.get<string>('UPLOAD_DIR', './uploads')); }

  async upload(actor: Actor, id: string, stage: string, body: Buffer) {
    if (!['VEHICLE', 'BEFORE', 'DURING', 'AFTER'].includes(stage)) throw new BadRequestException('照片阶段无效');
    if (!Buffer.isBuffer(body) || body.length < 12 || body.length > 2 * 1024 * 1024) throw new BadRequestException('照片需在 2 MB 以内');
    let mime: string;
    let ext: string;
    if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) { mime = 'image/jpeg'; ext = 'jpg'; }
    else if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { mime = 'image/png'; ext = 'png'; }
    else if (body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') { mime = 'image/webp'; ext = 'webp'; }
    else throw new BadRequestException('只接受 JPEG、PNG 或 WebP 照片');

    return this.writes.run(async (m) => {
      await this.orders.editable(actor, id, m);
      const [{ used }] = await m.query('SELECT COALESCE(SUM(size), 0) AS used FROM photos');
      const limit = Number(this.config.get('UPLOAD_MAX_BYTES', 6 * 1024 ** 3));
      if (Number(used) + body.length > limit) throw new BadRequestException('照片存储额度已满，请联系管理员归档');
      if (await m.countBy(Photo, { workOrderId: id }) >= 120) throw new BadRequestException('单工单最多保存 120 张照片');
      const path = `${randomUUID()}.${ext}`;
      await mkdir(this.root(), { recursive: true });
      await writeFile(join(this.root(), path), body, { flag: 'wx' });
      try {
        const photo = await m.save(Photo, m.create(Photo, { workOrderId: id, authorId: actor.id, stage, path, mime, size: body.length }));
        await audit(m, actor, 'UPLOAD_PHOTO', 'work_order', id, { photoId: photo.id, stage });
        return { id: photo.id, stage, size: body.length };
      } catch (error) {
        await unlink(join(this.root(), path)).catch(() => undefined);
        throw error;
      }
    });
  }

  async read(actor: Actor, id: string) {
    const photo = await this.db.manager.findOneBy(Photo, { id });
    if (!photo) throw new NotFoundException('照片不存在');
    await this.orders.accessible(actor, photo.workOrderId);
    try {
      return { body: await readFile(join(this.root(), photo.path)), mime: photo.mime };
    } catch {
      throw new NotFoundException('照片文件不存在，请联系管理员检查上传文件');
    }
  }
}

@Controller()
@UseGuards(JwtAuthGuard)
class PhotosController {
  constructor(private readonly service: PhotosService) {}
  @Post('work-orders/:id/photos/:stage')
  upload(@Req() r: AuthRequest, @Param('id') id: string, @Param('stage') stage: string, @Body() body: Buffer) {
    return this.service.upload(r.user, id, stage, body);
  }
  @Get('photos/:id')
  async read(@Req() r: AuthRequest, @Param('id') id: string, @Res() reply: FastifyReply) {
    const photo = await this.service.read(r.user, id);
    return reply.type(photo.mime).header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff').send(photo.body);
  }
}

@Module({ imports: [WorkOrdersModule], providers: [PhotosService], controllers: [PhotosController] })
export class PhotosModule {}
