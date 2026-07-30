import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';
import { EscalaController } from './escala.controller';
import { EscalaGateway } from './escala.gateway';
import { EscalaService } from './escala.service';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [EscalaController],
    providers: [EscalaService, EscalaGateway],
    exports: [EscalaService, EscalaGateway],
})
export class EscalaModule { }
