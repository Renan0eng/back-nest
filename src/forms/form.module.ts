import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { DatabaseModule } from 'src/database/database.module';
import { FormController } from './form.controller';
import { FormService } from './form.service';

@Module({
    imports: [
        DatabaseModule,
        AuthModule
    ], 
    controllers: [FormController],
    providers: [FormService],
})
export class FormModule { }