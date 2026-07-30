import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';
import { EscalaModule } from 'src/escala/escala.module';
import { FilaController } from './fila.controller';
import { FilaService } from './fila.service';

@Module({
    imports: [DatabaseModule, AuthModule, EscalaModule],
    controllers: [FilaController],
    providers: [FilaService],
    exports: [FilaService],
})
export class FilaModule { }
