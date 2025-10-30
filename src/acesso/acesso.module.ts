import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';
import { AcessoController } from './acesso.controller';
import { AcessoService } from './acesso.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
  ],
  controllers: [AcessoController],
  providers: [AcessoService],
})
export class AcessoModule {}