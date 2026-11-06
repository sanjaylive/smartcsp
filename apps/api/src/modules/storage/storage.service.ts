import { Injectable, Logger } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from '../../config/config';
import { hmac, safeEqualHex } from '../../common/crypto';

/**
 * Private object storage. Objects are never public: downloads use short-lived signed URLs that
 * are only issued after an authorization check by the caller.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger('Storage');
  private s3: S3Client | null = null;
  private bucketChecked = false;

  private client() {
    if (!this.s3) {
      const c = config();
      this.s3 = new S3Client({
        region: c.S3_REGION,
        endpoint: c.S3_ENDPOINT,
        forcePathStyle: c.S3_FORCE_PATH_STYLE,
        credentials: c.S3_ACCESS_KEY_ID
          ? { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY ?? '' }
          : undefined,
      });
    }
    return this.s3;
  }

  private fsPath(key: string) {
    const root = resolve(config().STORAGE_FS_ROOT);
    const p = resolve(join(root, key));
    if (!p.startsWith(root)) throw new Error('Invalid storage key');
    return p;
  }

  private async ensureBucket() {
    if (this.bucketChecked) return;
    const bucket = config().S3_BUCKET;
    try {
      await this.client().send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      // Local development convenience; in production the bucket is provisioned (private, encrypted).
      if (config().NODE_ENV === 'development' || config().NODE_ENV === 'test')
        await this.client().send(new CreateBucketCommand({ Bucket: bucket }));
    }
    this.bucketChecked = true;
  }

  async put(key: string, body: Buffer, contentType: string) {
    if (config().STORAGE_DRIVER === 'fs') {
      const p = this.fsPath(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, body);
      return;
    }
    await this.ensureBucket();
    await this.client().send(
      new PutObjectCommand({
        Bucket: config().S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: config().S3_ENDPOINT ? undefined : 'AES256',
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    if (config().STORAGE_DRIVER === 'fs') return readFile(this.fsPath(key));
    const r = await this.client().send(
      new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: key }),
    );
    return Buffer.from(await r.Body!.transformToByteArray());
  }

  async delete(key: string) {
    if (config().STORAGE_DRIVER === 'fs') return rm(this.fsPath(key), { force: true });
    await this.client().send(new DeleteObjectCommand({ Bucket: config().S3_BUCKET, Key: key }));
  }

  /** Short-lived download URL. Call only after checking the requester may access the object. */
  async signedUrl(key: string, fileName: string, contentType: string) {
    const ttl = config().SIGNED_URL_TTL_SECONDS;
    const safeName = fileName.replace(/[^\w.\- ]/g, '_');
    if (config().STORAGE_DRIVER === 'fs') {
      const payload = Buffer.from(
        JSON.stringify({ k: key, e: Date.now() + ttl * 1000, n: safeName, t: contentType }),
      ).toString('base64url');
      return {
        url: `${config().PUBLIC_API_URL}/v1/files/${payload}.${hmac(config().FILE_URL_SIGNING_KEY, payload)}`,
        expiresInSeconds: ttl,
      };
    }
    const url = await getSignedUrl(
      this.client(),
      new GetObjectCommand({
        Bucket: config().S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
        ResponseContentType: contentType,
      }),
      { expiresIn: ttl },
    );
    return { url, expiresInSeconds: ttl };
  }

  verifyFsToken(token: string): { key: string; name: string; type: string } | null {
    const [payload, sig] = token.split('.');
    if (!payload || !sig || !safeEqualHex(sig, hmac(config().FILE_URL_SIGNING_KEY, payload)))
      return null;
    const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      k: string;
      e: number;
      n: string;
      t: string;
    };
    if (p.e < Date.now()) return null;
    return { key: p.k, name: p.n, type: p.t };
  }
}
