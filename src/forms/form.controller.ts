import { Body, Controller, Get, Param, Post, Put, UsePipes, ValidationPipe } from '@nestjs/common';
import { SaveFormDto } from './dto/save-form.dto';
import { FormService } from './form.service';

@Controller('forms')
export class FormController {
    constructor(private readonly formService: FormService) { }

    @Get()
    findAll() {
        return this.formService.findAll();
    }

    @Post('')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    create(@Body() createFormDto: SaveFormDto) {
        // O DTO aqui é o 'SaveFormDto', mas você pode criar um 'CreateFormDto' se for diferente
        return this.formService.create(createFormDto);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.formService.findOne(id);
    }

    @Put(':id')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    update(@Param('id') id: string, @Body() updateFormDto: SaveFormDto) {
        return this.formService.update(id, updateFormDto);
    }

}