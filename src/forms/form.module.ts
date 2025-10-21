import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { FormController } from './form.controller';
import { FormService } from './form.service';

@Module({
    imports: [DatabaseModule], 
    controllers: [FormController],
    providers: [FormService],
})
export class FormModule { }