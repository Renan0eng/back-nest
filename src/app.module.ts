import { Module } from '@nestjs/common';
import { AcessoModule } from './acesso/acesso.module';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { FormModule } from './forms/form.module';

@Module({
  imports: [AuthModule, DatabaseModule, FormModule, AcessoModule],
})
export class AppModule {}
