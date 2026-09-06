import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';
import { GruposModule } from 'src/grupos/grupos.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { FormController } from './form.controller';
import { FormService } from './form.service';
import { FormImageService } from './form-image.service';

@Module({
    imports: [
        DatabaseModule,
        AuthModule,
        NotificationsModule,
        GruposModule,
    ],
    controllers: [FormController],
    providers: [FormService, FormImageService],
    exports: [FormService],
})
export class FormModule { }
