import { Controller, Get, Param, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { AvatarService } from './avatar.service';

@Controller('avatars')
@UseGuards(RefreshTokenGuard)
export class AvatarController {
  constructor(private readonly avatarService: AvatarService) {}

  @Post(':userId')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(@Param('userId') userId: string, @UploadedFile() file: Express.Multer.File, @Req() request: Request) {
    const baseUrl = process.env.PUBLIC_API_URL || `${request.protocol}://${request.get('host')}`;
    return this.avatarService.upload(userId, file, baseUrl);
  }

  @Get(':fileId')
  async get(@Param('fileId') fileId: string, @Res() response: Response) {
    const image = await this.avatarService.openDownload(fileId);
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Content-Length', image.length.toString());
    response.setHeader('Cache-Control', 'private, max-age=86400');
    image.stream.pipe(response);
  }
}
