import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request } from 'express';
import { Menu } from 'src/auth/menu.decorator';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { CreatePlantaoDto, UpdatePlantaoDto } from './dto/plantao.dto';
import { EscalaService } from './escala.service';

@Controller('admin/escala')
@UseGuards(RefreshTokenGuard)
@Menu('escala')
export class EscalaController {
    constructor(private readonly escalaService: EscalaService) { }

    @Get()
    findAll(
        @Query('from') from?: string,
        @Query('to') to?: string,
        @Query('setor') setor?: string,
        @Query('grupoId') grupoId?: string,
        @Query('deleted') deleted?: string,
    ) {
        return this.escalaService.findAll({ from, to, setor, grupoId: grupoId ? Number(grupoId) : undefined, deleted: deleted === 'true' });
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.escalaService.findOne(id);
    }

    @Get(':id/historico')
    history(@Param('id') id: string) {
        return this.escalaService.history(id);
    }

    @Get(':id/atendimentos')
    atendimentos(@Param('id') id: string) {
        return this.escalaService.atendimentos(id);
    }

    @Post()
    @Menu('escala-admin')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    create(@Body() dto: CreatePlantaoDto, @Req() req: Request) {
        return this.escalaService.create(dto, req.user);
    }

    @Put(':id')
    @Menu('escala-admin')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    update(@Param('id') id: string, @Body() dto: UpdatePlantaoDto, @Req() req: Request) {
        return this.escalaService.update(id, dto, req.user);
    }

    @Delete(':id')
    @Menu('escala-admin')
    remove(@Param('id') id: string, @Req() req: Request) {
        return this.escalaService.remove(id, req.user);
    }

    @Post(':id/restaurar')
    @Menu('escala-admin')
    restore(@Param('id') id: string, @Req() req: Request) {
        return this.escalaService.restore(id, req.user);
    }

    @Post(':id/pegar')
    pegar(@Param('id') id: string, @Req() req: Request) {
        return this.escalaService.pegar(id, req.user);
    }

    @Post(':id/liberar')
    liberar(@Param('id') id: string, @Req() req: Request) {
        return this.escalaService.liberar(id, req.user);
    }

    @Post(':id/checkin')
    checkin(@Param('id') id: string, @Req() req: Request) {
        return this.escalaService.checkin(id, req.user);
    }

    @Post(':id/notificar-checkin')
    @Menu('escala-admin')
    notificarCheckin(@Param('id') id: string, @Req() req: Request) {
        return this.escalaService.notifyCheckin(id, req.user);
    }

    @Post(':id/checkout')
    checkout(@Param('id') id: string, @Req() req: Request) {
        return this.escalaService.checkout(id, req.user);
    }
}
