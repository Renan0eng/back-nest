import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { AcessoController } from './acesso.controller';
import { AcessoService } from './acesso.service';

@Module({
  imports: [
    DatabaseModule,
  ],
  controllers: [AcessoController],
  providers: [AcessoService],
})
export class AcessoModule {}