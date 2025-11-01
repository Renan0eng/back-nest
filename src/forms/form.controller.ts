import { Body, Controller, Get, Param, Post, Put, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { SaveFormDto } from './dto/save-form.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { FormService } from './form.service';

@Controller('forms')
export class FormController {
    constructor(private readonly formService: FormService) { }

    @Get()
    @UseGuards(RefreshTokenGuard)
    findAll() {
        return this.formService.findAll();
    }

    @Post('')
    @UseGuards(RefreshTokenGuard)
    @UsePipes(new ValidationPipe({ whitelist: true }))
    create(@Body() createFormDto: SaveFormDto) {
        return this.formService.create(createFormDto);
    }

    @Get(':id')
    @UseGuards(RefreshTokenGuard)
    findOne(@Param('id') id: string) {
        return this.formService.findOne(id);
    }

    @Put(':id')
    @UseGuards(RefreshTokenGuard)
    @UsePipes(new ValidationPipe({ whitelist: true }))
    update(@Param('id') id: string, @Body() updateFormDto: SaveFormDto) {
        return this.formService.update(id, updateFormDto);
    }

    @Post(':id/responses')
    @UseGuards(RefreshTokenGuard)
    @UsePipes(new ValidationPipe({ whitelist: true }))
    submitResponse(
        @Param('id') formId: string,
        @Body() submitResponseDto: SubmitResponseDto,
    ) {
        return this.formService.submitResponse(formId, submitResponseDto);
    }

    @Get(':id/responses')
    @UseGuards(RefreshTokenGuard)
    findResponses(@Param('id') formId: string) {
        return this.formService.findResponses(formId);
    }

    @Get('response/:responseId')
    @UseGuards(RefreshTokenGuard)
    findResponseDetail(@Param('responseId') responseId: string) {
        return this.formService.findResponseDetail(responseId);
    }

}