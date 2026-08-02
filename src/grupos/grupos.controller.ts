import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request } from 'express';
import { Menu } from 'src/auth/menu.decorator';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { AddMembrosDto, CreateGrupoDto, UpdateGrupoDto } from './dto/grupo.dto';
import { GruposService } from './grupos.service';

@Controller('admin/grupos')
@UseGuards(RefreshTokenGuard)
@Menu('grupos')
export class GruposController {
    constructor(private readonly gruposService: GruposService) { }

    @Get()
    findAll() {
        return this.gruposService.findAll();
    }

    @Get('afiliacoes/lista')
    findAffiliations() {
        return this.gruposService.findAffiliations();
    }

    @Get(':id')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.gruposService.findOne(id);
    }

    @Post(':id/afiliacoes')
    requestAffiliation(@Param('id', ParseIntPipe) id: number, @Body('destinoId', ParseIntPipe) destinoId: number, @Req() req: Request) {
        return this.gruposService.requestAffiliation(id, destinoId, (req.user as any)?.idUser);
    }

    @Put('afiliacoes/:id')
    updateAffiliation(@Param('id', ParseIntPipe) id: number, @Body('status') status: 'Ativa' | 'Recusada' | 'Encerrada') {
        return this.gruposService.updateAffiliation(id, status);
    }

    @Post()
    @UsePipes(new ValidationPipe({ whitelist: true }))
    create(@Body() dto: CreateGrupoDto, @Req() req: Request) {
        const creatorId = (req.user as any)?.idUser;
        return this.gruposService.create(dto, creatorId);
    }

    @Put(':id')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGrupoDto) {
        return this.gruposService.update(id, dto);
    }

    @Delete(':id')
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.gruposService.remove(id);
    }

    @Post(':id/membros')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    addMembros(@Param('id', ParseIntPipe) id: number, @Body() dto: AddMembrosDto) {
        return this.gruposService.addMembros(id, dto.userIds);
    }

    @Delete(':id/membros/:userId')
    removeMembro(@Param('id', ParseIntPipe) id: number, @Param('userId') userId: string) {
        return this.gruposService.removeMembro(id, userId);
    }

    @Put(':id/membros/:userId/mover')
    moveMembro(@Param('id', ParseIntPipe) id: number, @Param('userId') userId: string) {
        return this.gruposService.moveMembro(id, userId);
    }
}
