import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CampanhasController } from './campanhas.controller';
import { CampanhasService } from './campanhas.service';
@Module({ imports: [DatabaseModule, AuthModule], controllers: [CampanhasController], providers: [CampanhasService] })
export class CampanhasModule {}
