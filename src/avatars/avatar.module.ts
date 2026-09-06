import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AvatarController],
  providers: [AvatarService],
  exports: [AvatarService],
})
export class AvatarModule {}
