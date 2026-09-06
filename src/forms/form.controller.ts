import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors, UsePipes, ValidationPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { AppTokenGuard } from 'src/auth/app-token.guard';
import { AuthService } from 'src/auth/auth.service';
import { Menu } from 'src/auth/menu.decorator';
import { GruposService } from 'src/grupos/grupos.service';
import { SaveFormDto } from './dto/save-form.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { FormService } from './form.service';
import { FormImageService } from './form-image.service';

@Controller('forms')
@UseGuards(AppTokenGuard)
@Menu('formulario')
export class FormController {
    constructor(
        private readonly formService: FormService,
        private readonly authService: AuthService,
        private readonly gruposService: GruposService,
        private readonly formImageService: FormImageService,
    ) { }

    @Post('images')
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
    async uploadImage(@UploadedFile() file: Express.Multer.File, @Req() request: Request) {
        const imageId = await this.formImageService.upload(file);
        const baseUrl = process.env.PUBLIC_API_URL || `${request.protocol}://${request.get('host')}`;
        return { id: imageId, url: `${baseUrl}/forms/images/${imageId}` };
    }

    @Get('images/:fileId')
    async getImage(@Param('fileId') fileId: string, @Res() response: Response) {
        const image = await this.formImageService.openDownload(fileId);
        response.setHeader('Content-Type', image.contentType);
        response.setHeader('Content-Length', image.length.toString());
        response.setHeader('Cache-Control', 'private, max-age=86400');
        image.stream.pipe(response);
    }

    @Get()
    async findAll(
        @Req() request: Request,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('title') title?: string,
        @Query('description') description?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('createdAt') createdAt?: string,
        @Query('createdFrom') createdFrom?: string,
        @Query('createdTo') createdTo?: string,
        @Query('isScreening') isScreening?: string,
        @Query('responsesMin') responsesMin?: string,
        @Query('responsesMax') responsesMax?: string,
        @Query('deleted') deleted?: string,
    ) {
        const p = page ? parseInt(page, 10) : undefined;
        const ps = pageSize ? parseInt(pageSize, 10) : undefined;

        const filters: any = {};
        if (deleted === 'true') filters.deleted = true;
        if (title) filters.title = title;
        if (description) filters.description = description;
        if (from) filters.from = from;
        if (to) filters.to = to;
        if (createdAt) filters.createdAt = createdAt;
        if (createdFrom) filters.createdFrom = createdFrom;
        if (createdTo) filters.createdTo = createdTo;
        if (typeof isScreening !== 'undefined') {
            if (isScreening === 'true') filters.isScreening = true;
            else if (isScreening === 'false') filters.isScreening = false;
        }
        if (typeof responsesMin !== 'undefined') {
            const v = parseInt(responsesMin as any, 10);
            if (!isNaN(v)) filters.responsesMin = v;
        }
        if (typeof responsesMax !== 'undefined') {
            const v = parseInt(responsesMax as any, 10);
            if (!isNaN(v)) filters.responsesMax = v;
        }

        const scope = await this.gruposService.getScopeForUser((request as any).user);
        const opts: any = p || ps ? { page: p, pageSize: ps, filters, scope } : { filters, scope };
        return this.formService.findAll(opts);
    }

    @Get('screenings')
    async findScreenings(@Req() request: Request, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
        const p = page ? parseInt(page, 10) : undefined;
        const ps = pageSize ? parseInt(pageSize, 10) : undefined;
        const scope = await this.gruposService.getScopeForUser((request as any).user);
        return this.formService.findScreenings({ page: p, pageSize: ps, scope });
    }

    @Post()
    @UsePipes(new ValidationPipe({ whitelist: true }))
    create(@Body() dto: SaveFormDto, @Req() request: Request) {
        const creatorId = ((request as any).user as any)?.idUser;
        return this.formService.create(dto, creatorId);
    }

    @Get(':id')
    @Menu('')
    findOne(@Param('id') id: string) {
        return this.formService.findOne(id);
    }

    @Put(':id')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    update(@Param('id') id: string, @Body() dto: SaveFormDto) {
        return this.formService.update(id, dto);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.formService.delete(id);
    }

    @Post(':id/restaurar')
    restore(@Param('id') id: string) {
        return this.formService.restore(id);
    }

    @Post(':id/activate-screening')
    activateScreening(@Param('id') id: string) {
        return this.formService.setScreening(id, true);
    }

    @Post(':id/deactivate-screening')
    deactivateScreening(@Param('id') id: string) {
        return this.formService.setScreening(id, false);
    }

    @Post(':id/toggle-screening')
    toggleScreening(@Param('id') id: string) {
        return this.formService.toggleScreening(id);
    }

    @Post(':id/responses')
    @Menu('')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    async submitResponse(@Param('id') id: string, @Body() dto: SubmitResponseDto, @Req() request: Request) {

        // se tiver dto userId, usar ele, senão validar token
        if (!dto.userId) {
            const authHeader = request.headers.authorization
            const refreshToken = request.cookies['refresh_token']

            if (!authHeader && !refreshToken) throw new UnauthorizedException('Token não fornecido')
            if (authHeader && !authHeader.startsWith('Bearer ')) {
                throw new UnauthorizedException('Token malformado')
            }

            const tokenBearer = authHeader?.split(' ')[1]
            const token = tokenBearer || refreshToken;

            if (!token) throw new UnauthorizedException('Token inválido')

            const dataToken = await this.authService.validateToken(token, {
                type: tokenBearer ? 'access' : 'refresh',
            })
            if (!dataToken) throw new UnauthorizedException('Token inválido')

            const userId = dataToken.dataToken.sub
            return this.formService.submitResponse(id, dto, userId);
        }

        return this.formService.submitResponse(id, dto, dto.userId);
    }

    @Put(':id/responses/:responseId')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    async updateResponse(@Param('id') id: string, @Param('responseId') responseId: string, @Body() dto: SubmitResponseDto, @Req() request: Request) {
        // se tiver dto userId, usar ele, senão validar token
        if (!dto.userId) {
            const authHeader = request.headers.authorization
            const refreshToken = request.cookies['refresh_token']

            if (!authHeader && !refreshToken) throw new UnauthorizedException('Token não fornecido')
            if (authHeader && !authHeader.startsWith('Bearer ')) {
                throw new UnauthorizedException('Token malformado')
            }

            const tokenBearer = authHeader?.split(' ')[1]
            const token = tokenBearer || refreshToken;

            if (!token) throw new UnauthorizedException('Token inválido')

            const dataToken = await this.authService.validateToken(token, {
                type: tokenBearer ? 'access' : 'refresh',
            })
            if (!dataToken) throw new UnauthorizedException('Token inválido')

            const userId = dataToken.dataToken.sub
            return this.formService.updateResponse(id, dto, userId, responseId);
        }

        return this.formService.updateResponse(id, dto, dto.userId, responseId);
    }

    @Delete(':id/responses/:responseId')
    async deleteResponse(@Param('id') id: string, @Param('responseId') responseId: string, @Req() request: Request) {
        const authHeader = request.headers.authorization
        const refreshToken = request.cookies['refresh_token']

        if (!authHeader && !refreshToken) throw new UnauthorizedException('Token não fornecido')
        if (authHeader && !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Token malformado')
        }

        const tokenBearer = authHeader?.split(' ')[1]
        const token = tokenBearer || refreshToken;

        if (!token) throw new UnauthorizedException('Token inválido')

        const dataToken = await this.authService.validateToken(token, {
            type: tokenBearer ? 'access' : 'refresh',
        })
        if (!dataToken) throw new UnauthorizedException('Token inválido')

        const userId = dataToken.dataToken.sub
        return this.formService.deleteResponse(id, userId, responseId);
    }

    @Get(':id/responses')
    @Menu('respostas')
    findResponses(@Param('id') id: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
        const p = page ? parseInt(page, 10) : undefined;
        const ps = pageSize ? parseInt(pageSize, 10) : undefined;
        return (this.formService as any).findResponses ? (this.formService as any).findResponses(id, { page: p, pageSize: ps }) : this.formService.findResponses(id);
    }
    
    @Get(':id/responses/:responseId')
    @Menu('respostas')
    findResponse(@Param('id') id: string, @Param('responseId') responseId: string) {
        return this.formService.findResponse(id, responseId);
    }

    @Get('/responses/list')
    @Menu('respostas')
    async findAllResponses(
        @Req() request: Request,
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('formTitle') formTitle?: string,
        @Query('patientName') patientName?: string,
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('isScreening') isScreening?: string,
        @Query('scoreMin') scoreMin?: string,
        @Query('scoreMax') scoreMax?: string,
        @Query('deleted') deleted?: string,
    ) {
        const p = page ? parseInt(page, 10) : undefined;
        const ps = pageSize ? parseInt(pageSize, 10) : undefined;

        const filters: any = {};
        if (formTitle) filters.formTitle = formTitle;
        if (patientName) filters.patientName = patientName;
        if (from) filters.from = from;
        if (to) filters.to = to;
        if (typeof isScreening !== 'undefined') {
            if (isScreening === 'true') filters.isScreening = true;
            else if (isScreening === 'false') filters.isScreening = false;
        }
        if (typeof scoreMin !== 'undefined') {
            const v = parseInt(scoreMin as any, 10);
            if (!isNaN(v)) filters.scoreMin = v;
        }
        if (typeof scoreMax !== 'undefined') {
            const v = parseInt(scoreMax as any, 10);
            if (!isNaN(v)) filters.scoreMax = v;
        }
        if (deleted === 'true') filters.deleted = true;

        const scope = await this.gruposService.getScopeForUser((request as any).user);
        return this.formService.findAllResponses({ page: p, pageSize: ps, filters, scope });
    }

    @Post('responses/:responseId/restaurar')
    @Menu('respostas')
    restoreResponse(@Param('responseId') responseId: string) {
        return this.formService.restoreResponse(responseId);
    }

    @Get('response/:responseId')
    @Menu('respostas')
    findResponseDetail(@Param('responseId') id: string) {
        return this.formService.findResponseDetail(id);
    }

    @Get('/users/toAssign')
    @Menu('atribuir-usuarios')
    getUsersToAssign(
        @Query('name') name?: string,
        @Query('email') email?: string,
        @Query('sexo') sexo?: string,
        @Query('unidadeSaude') unidadeSaude?: string,
        @Query('medicamentos') medicamentos?: string,
        @Query('exames') exames?: string,
        @Query('alergias') alergias?: string,
        @Query('birthDateFrom') birthDateFrom?: string,
        @Query('birthDateTo') birthDateTo?: string,
        @Query('ageMin') ageMin?: string,
        @Query('ageMax') ageMax?: string,
    ) {
        return this.formService.getUsersToAssign({
            name: name || undefined,
            email: email || undefined,
            sexo: sexo || undefined,
            unidadeSaude: unidadeSaude || undefined,
            medicamentos: medicamentos || undefined,
            exames: exames === 'true' ? true : exames === 'false' ? false : undefined,
            alergias: alergias || undefined,
            birthDateFrom: birthDateFrom || undefined,
            birthDateTo: birthDateTo || undefined,
            ageMin: ageMin ? parseInt(ageMin, 10) : undefined,
            ageMax: ageMax ? parseInt(ageMax, 10) : undefined,
        });
    }

    @Get(':id/assigned')
    @Menu('atribuir-usuarios')
    getAssignedUsers(@Param('id') id: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
        const p = page ? parseInt(page, 10) : undefined;
        const ps = pageSize ? parseInt(pageSize, 10) : undefined;
        return (this.formService as any).getAssignedUsers ? (this.formService as any).getAssignedUsers(id, { page: p, pageSize: ps }) : this.formService.getAssignedUsers(id);
    }

    @Post(':id/assign')
    @Menu('atribuir-usuarios')
    assignUsers(
        @Param('id') id: string,
        @Body('userIds') userIds: string[],
    ) {
        return this.formService.assignUsers(id, userIds);
    }

    // remove o usuário da atribuição
    @Post(':id/unassign')
    @Menu('atribuir-usuarios')
    unassignUsers(
        @Param('id') id: string,
        @Body('userIds') userIds: string[],
    ) {
        return this.formService.unassignUsers(id, userIds);
    }

    @Get('/user/my')
    @Menu('')
    async getMyForms(@Req() request: Request) {
        const authHeader = request.headers.authorization
        const refreshToken = request.cookies['refresh_token']

        if (!authHeader && !refreshToken) throw new UnauthorizedException('Token não fornecido')
        if (authHeader && !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Token malformado')
        }

        const tokenBearer = authHeader?.split(' ')[1]

        const token = tokenBearer || refreshToken;

        if (!token) throw new UnauthorizedException('Token inválido')

        const dataToken = await this.authService.validateToken(token, {
            type: tokenBearer ? 'access' : 'refresh',
        })

        if (!dataToken) throw new UnauthorizedException('Token inválido')

        const forms = await this.formService.getMyForms(dataToken.dataToken.sub);

        if (!forms) throw new UnauthorizedException('Usuário não encontrado')

        return forms;
    }
}
