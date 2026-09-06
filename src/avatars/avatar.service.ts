import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import { Readable } from 'stream';
import { PrismaService } from 'src/database/prisma.service';

const MAX_STORED_AVATAR_BYTES = 1024 * 1024;

@Injectable()
export class AvatarService implements OnModuleDestroy {
  private client?: MongoClient;

  constructor(private readonly prisma: PrismaService) {}

  private async bucket(): Promise<GridFSBucket> {
    const uri = process.env.MONGODB_URL;
    if (!uri) throw new BadRequestException('MONGODB_URL não foi configurada para o armazenamento de imagens.');
    if (!this.client) {
      this.client = new MongoClient(uri);
      await this.client.connect();
    }
    return new GridFSBucket(this.client.db(process.env.MONGODB_DATABASE || 'prefeitura'), { bucketName: 'avatars' });
  }

  async upload(userId: string, file: Express.Multer.File, baseUrl: string) {
    if (!file) throw new BadRequestException('Envie uma imagem para o avatar.');
    if (file.mimetype !== 'image/webp') {
      throw new BadRequestException('A imagem precisa ser enviada em WebP. Tente selecionar a imagem novamente.');
    }
    if (file.size > MAX_STORED_AVATAR_BYTES) {
      throw new BadRequestException('A imagem continua muito pesada após a otimização. Escolha outra imagem.');
    }
    if (!file.buffer.subarray(0, 12).toString('ascii').startsWith('RIFF') || file.buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
      throw new BadRequestException('O arquivo enviado não é uma imagem WebP válida.');
    }
    const user = await this.prisma.user.findUnique({ where: { idUser: userId }, select: { idUser: true, avatar: true } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const bucket = await this.bucket();
    const stream = bucket.openUploadStream(`${userId}.webp`, {
      contentType: 'image/webp',
      metadata: { userId, size: file.size, optimized: true },
    });
    await new Promise<void>((resolve, reject) => Readable.from(file.buffer).pipe(stream).on('error', reject).on('finish', resolve));

    const url = `${baseUrl}/avatars/${stream.id.toString()}`;
    await this.prisma.user.update({ where: { idUser: userId }, data: { avatar: url } });

    const oldId = user.avatar?.match(/\/avatars\/([a-f\d]{24})(?:$|[?#])/i)?.[1];
    if (oldId && ObjectId.isValid(oldId)) {
      await bucket.delete(new ObjectId(oldId)).catch(() => undefined);
    }
    return { url };
  }

  async openDownload(fileId: string) {
    if (!ObjectId.isValid(fileId)) throw new NotFoundException('Imagem não encontrada.');
    const bucket = await this.bucket();
    const id = new ObjectId(fileId);
    const file = await bucket.find({ _id: id }).next();
    if (!file) throw new NotFoundException('Imagem não encontrada.');
    return { stream: bucket.openDownloadStream(id), length: file.length };
  }

  async onModuleDestroy() { await this.client?.close(); }
}
