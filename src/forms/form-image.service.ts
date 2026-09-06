import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import { Readable } from 'stream';

@Injectable()
export class FormImageService implements OnModuleDestroy {
  private client?: MongoClient;

  private async bucket(): Promise<GridFSBucket> {
    const uri = process.env.MONGODB_URL;
    if (!uri) throw new BadRequestException('MONGODB_URL não foi configurada para o armazenamento de imagens.');
    if (!this.client) {
      this.client = new MongoClient(uri);
      await this.client.connect();
    }
    return new GridFSBucket(this.client.db(process.env.MONGODB_DATABASE || 'prefeitura'), { bucketName: 'form-question-images' });
  }

  async upload(file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Envie uma imagem.');
    if (!file.mimetype.startsWith('image/')) throw new BadRequestException('Apenas arquivos de imagem são permitidos.');
    const stream = (await this.bucket()).openUploadStream(file.originalname, { contentType: file.mimetype, metadata: { size: file.size } });
    await new Promise<void>((resolve, reject) => Readable.from(file.buffer).pipe(stream).on('error', reject).on('finish', resolve));
    return stream.id.toString();
  }

  async openDownload(fileId: string) {
    if (!ObjectId.isValid(fileId)) throw new NotFoundException('Imagem não encontrada.');
    const bucket = await this.bucket();
    const id = new ObjectId(fileId);
    const file = await bucket.find({ _id: id }).next();
    if (!file) throw new NotFoundException('Imagem não encontrada.');
    return { stream: bucket.openDownloadStream(id), contentType: file.contentType || 'application/octet-stream', length: file.length };
  }

  async onModuleDestroy() { await this.client?.close(); }
}
