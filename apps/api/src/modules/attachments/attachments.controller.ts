import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { connect } from 'node:net';
import { z } from 'zod';
import { Ctx, Public, TenantAccess } from '../../common/access';
import { Db, type TenantCtx, type Tx } from '../../common/db';
import { ApiDoc, parse } from '../../common/http';
import { AppError, denied, notFound } from '../../common/errors';
import { AuditService } from '../../common/audit';
import { config } from '../../config/config';
import { JobsService } from '../../jobs/jobs.service';
import { StorageService } from '../storage/storage.service';
import { EntitlementsService } from '../subscription/entitlements.service';
import { visibleWhere } from '../records/records.service';

const uploadSchema = z.object({
  ownerType: z.enum(['RECORD', 'CUSTOMER', 'CUSTOMER_KYC', 'PAYMENT_SUBMISSION', 'TENANT_LOGO']),
  ownerId: z.uuid(),
});

/** Allow-list by magic bytes (not by the client-declared MIME type). */
function sniff(buf: Buffer): { type: string; ext: string } | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { type: 'image/png', ext: 'png' };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { type: 'image/jpeg', ext: 'jpg' };
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-')
    return { type: 'application/pdf', ext: 'pdf' };
  return null;
}

/** Minimal clamd INSTREAM client. */
function clamScan(buf: Buffer, host: string, port: number): Promise<'CLEAN' | 'INFECTED'> {
  return new Promise((resolve, reject) => {
    const sock = connect(port, host);
    let out = '';
    sock.setTimeout(30_000, () => sock.destroy(new Error('clamd timeout')));
    sock.on('connect', () => {
      sock.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 64 * 1024) {
        const chunk = buf.subarray(i, i + 64 * 1024);
        const len = Buffer.alloc(4);
        len.writeUInt32BE(chunk.length);
        sock.write(len);
        sock.write(chunk);
      }
      sock.write(Buffer.alloc(4));
    });
    sock.on('data', (d) => (out += d.toString()));
    sock.on('end', () =>
      out.includes('OK') && !out.includes('FOUND')
        ? resolve('CLEAN')
        : out.includes('FOUND')
          ? resolve('INFECTED')
          : reject(new Error(out)),
    );
    sock.on('error', reject);
  });
}

@Controller('v1')
export class AttachmentsController implements OnModuleInit {
  private readonly log = new Logger('Attachments');

  constructor(
    private readonly db: Db,
    private readonly storage: StorageService,
    private readonly entitlements: EntitlementsService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    // Quarantine: files stay unavailable until scanned (or explicitly marked SKIPPED when no scanner is configured).
    this.jobs.register('attachment.scan', async (payload) => {
      const { tenantId, attachmentId } = payload as { tenantId: string; attachmentId: string };
      await this.db.inTenant(
        { tenantId, userId: '00000000-0000-0000-0000-000000000000' },
        async (tx) => {
          const a = await tx.attachment.findFirst({ where: { id: attachmentId, tenantId } });
          if (!a || a.scanStatus !== 'PENDING') return;
          let status: 'CLEAN' | 'INFECTED' | 'SKIPPED' = 'SKIPPED';
          if (process.env.ATTACHMENT_SCAN_DRIVER === 'clamav') {
            status = await clamScan(
              await this.storage.get(a.storageKey),
              process.env.CLAMAV_HOST ?? '127.0.0.1',
              Number(process.env.CLAMAV_PORT ?? 3310),
            );
            if (status === 'INFECTED') await this.storage.delete(a.storageKey);
          }
          await tx.attachment.update({ where: { id: a.id }, data: { scanStatus: status } });
        },
      );
    });
  }

  /** Verifies the uploader/viewer may access the owning object. */
  private async assertOwnerAccess(
    tx: Tx,
    ctx: TenantCtx,
    ownerType: string,
    ownerId: string,
    mode: 'read' | 'write',
  ) {
    switch (ownerType) {
      case 'RECORD': {
        if (!ctx.permissions.has('records.view')) throw denied('records.view');
        if (mode === 'write' && !ctx.permissions.has('records.edit')) throw denied('records.edit');
        if (
          !(await tx.serviceRecord.findFirst({
            where: { ...visibleWhere(ctx), id: ownerId },
            select: { id: true },
          }))
        )
          throw notFound('Record');
        return;
      }
      case 'CUSTOMER': {
        if (!ctx.permissions.has(mode === 'write' ? 'customers.manage' : 'customers.view'))
          throw denied('customers.view');
        if (
          !(await tx.customer.findFirst({
            where: { id: ownerId, tenantId: ctx.tenantId },
            select: { id: true },
          }))
        )
          throw notFound('Customer');
        return;
      }
      case 'CUSTOMER_KYC': {
        // ID documents are sensitive personal data: both reading and uploading need
        // customers.view_sensitive, and uploading also needs customers.manage.
        if (!ctx.permissions.has('customers.view_sensitive'))
          throw denied('customers.view_sensitive');
        if (mode === 'write' && !ctx.permissions.has('customers.manage'))
          throw denied('customers.manage');
        if (
          !(await tx.customer.findFirst({
            where: { id: ownerId, tenantId: ctx.tenantId },
            select: { id: true },
          }))
        )
          throw notFound('Customer');
        return;
      }
      case 'PAYMENT_SUBMISSION': {
        if (!ctx.permissions.has(mode === 'write' ? 'subscription.manage' : 'subscription.view'))
          throw denied('subscription.view');
        if (
          !(await tx.paymentSubmission.findFirst({
            where: { id: ownerId, tenantId: ctx.tenantId },
            select: { id: true },
          }))
        )
          throw notFound('Payment submission');
        return;
      }
      case 'TENANT_LOGO': {
        if (mode === 'write' && !ctx.permissions.has('settings.manage'))
          throw denied('settings.manage');
        if (ownerId !== ctx.tenantId) throw notFound('Shop');
        return;
      }
      default:
        throw denied();
    }
  }

  @Post('attachments')
  @TenantAccess('attachments.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  @ApiDoc({
    summary:
      'Upload a PNG, JPEG or PDF (multipart: file, ownerType, ownerId). Files are quarantined until scanned.',
    tags: ['Attachments'],
  })
  upload(
    @Ctx() ctx: TenantCtx,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: unknown,
  ) {
    const dto = parse(uploadSchema, body);
    if (!file)
      throw new AppError('FILE_REJECTED', 'Attach a file', undefined, { file: ['Required'] });
    if (file.size > config().ATTACHMENT_MAX_BYTES)
      throw new AppError(
        'FILE_REJECTED',
        `Files must be at most ${Math.round(config().ATTACHMENT_MAX_BYTES / 1048576)} MB`,
      );
    const kind = sniff(file.buffer);
    if (!kind) throw new AppError('FILE_REJECTED', 'Only PNG, JPEG and PDF files are accepted');
    if (dto.ownerType === 'TENANT_LOGO' && kind.type === 'application/pdf')
      throw new AppError('FILE_REJECTED', 'Logos must be PNG or JPEG');
    return this.db.inTenant(ctx, async (tx) => {
      await this.assertOwnerAccess(tx, ctx, dto.ownerType, dto.ownerId, 'write');
      await this.entitlements.assertStorage(tx, ctx.tenantId, file.size);
      const id = randomUUID();
      const key = `tenants/${ctx.tenantId}/attachments/${id}.${kind.ext}`;
      await this.storage.put(key, file.buffer, kind.type);
      const fileName = (file.originalname || `file.${kind.ext}`)
        .replace(/[^\w.\- ]/g, '_')
        .slice(0, 100);
      const a = await tx.attachment.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          ownerType: dto.ownerType,
          ownerId: dto.ownerId,
          storageKey: key,
          fileName,
          contentType: kind.type,
          sizeBytes: file.size,
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedByUserId: ctx.userId,
        },
      });
      if (dto.ownerType === 'TENANT_LOGO')
        await tx.tenant.update({ where: { id: ctx.tenantId }, data: { logoAttachmentId: id } });
      await this.jobs.enqueue(
        tx,
        'attachment.scan',
        { tenantId: ctx.tenantId, attachmentId: id },
        { tenantId: ctx.tenantId, dedupeKey: `scan:${id}` },
      );
      await this.audit.tenant(tx, ctx, {
        action: 'attachment.uploaded',
        targetType: 'attachment',
        targetId: id,
        data: { ownerType: dto.ownerType, ownerId: dto.ownerId, sizeBytes: file.size },
      });
      this.jobs.kick();
      return {
        id: a.id,
        fileName: a.fileName,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        scanStatus: a.scanStatus,
      };
    });
  }

  @Get('attachments/:id/url')
  @TenantAccess()
  @ApiDoc({
    summary: 'Short-lived download URL (issued only after a permission check)',
    tags: ['Attachments'],
  })
  url(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const a = await tx.attachment.findFirst({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!a) throw notFound('Attachment');
      await this.assertOwnerAccess(tx, ctx, a.ownerType, a.ownerId, 'read');
      if (a.scanStatus === 'PENDING')
        throw new AppError('CONFLICT', 'This file is still being checked. Try again shortly.');
      if (a.scanStatus === 'INFECTED')
        throw new AppError('FILE_REJECTED', 'This file failed the security scan');
      await this.audit.tenant(tx, ctx, {
        action: 'attachment.url_issued',
        targetType: 'attachment',
        targetId: id,
      });
      return this.storage.signedUrl(a.storageKey, a.fileName, a.contentType);
    });
  }

  @Delete('attachments/:id')
  @TenantAccess('attachments.upload')
  @ApiDoc({ summary: 'Remove an attachment (soft delete)', tags: ['Attachments'] })
  remove(@Ctx() ctx: TenantCtx, @Param('id', ParseUUIDPipe) id: string) {
    return this.db.inTenant(ctx, async (tx) => {
      const a = await tx.attachment.findFirst({
        where: { id, tenantId: ctx.tenantId, deletedAt: null },
      });
      if (!a) throw notFound('Attachment');
      await this.assertOwnerAccess(tx, ctx, a.ownerType, a.ownerId, 'write');
      await tx.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.tenant(tx, ctx, {
        action: 'attachment.deleted',
        targetType: 'attachment',
        targetId: id,
      });
      return { ok: true };
    });
  }

  /** Download endpoint for the local `fs` storage driver; the HMAC-signed token is the authorization. */
  @Get('files/:token')
  @Public()
  async file(@Param('token') token: string, @Res() res: Response) {
    const t = this.storage.verifyFsToken(token);
    if (!t) throw new AppError('FORBIDDEN', 'This link has expired');
    const buf = await this.storage.get(t.key);
    res.setHeader('Content-Type', t.type);
    res.setHeader('Content-Disposition', `attachment; filename="${t.name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  }
}
