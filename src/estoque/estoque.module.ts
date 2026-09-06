import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { DatabaseModule } from 'src/database/database.module';
import { EstoqueController } from './estoque.controller';
import { EstoqueService } from './estoque.service';

@Module({
    imports: [DatabaseModule, AuthModule, NotificationsModule],
    controllers: [EstoqueController],
    providers: [EstoqueService],
    exports: [EstoqueService],
})
export class EstoqueModule { }
