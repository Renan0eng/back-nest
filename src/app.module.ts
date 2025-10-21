import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { FormModule } from './forms/form.module';

@Module({
  imports: [AuthModule, DatabaseModule, FormModule],
})
export class AppModule {}
