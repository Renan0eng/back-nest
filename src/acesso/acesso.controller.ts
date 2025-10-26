import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put } from '@nestjs/common';
import { AcessoService } from './acesso.service';
import { CreateMenuAcessoDto, CreateNivelAcessoDto, UpdateMenuAcessoDto, UpdateNivelAcessoDto, UpdateNivelMenusDto, UpdateUserNivelDto } from './dto/acesso.dto';
import { UpdateUserStatusDto } from './dto/update-user.dto';

@Controller('admin/acesso')
export class AcessoController {
    constructor(private readonly acessoService: AcessoService) { }

    // --- Nivel_Acesso ---

    @Get('niveis')
    findNiveis() {
        return this.acessoService.findNiveisComMenus(); // Precisa incluir os menus
    }

    @Post('niveis')
    createNivel(@Body() data: CreateNivelAcessoDto) {
        return this.acessoService.createNivel(data);
    }

    @Put('niveis/:id')
    updateNivel(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateNivelAcessoDto) {
        return this.acessoService.updateNivel(id, data);
    }

    @Delete('niveis/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteNivel(@Param('id', ParseIntPipe) id: number) {
        return this.acessoService.deleteNivel(id);
    }

    // --- Rota para Vínculo M-N ---

    @Put('niveis/:id/menus')
    updateNivelMenus(
        @Param('id', ParseIntPipe) id: number,
        @Body() data: UpdateNivelMenusDto, // DTO com { menuIds: number[] }
    ) {
        return this.acessoService.updateNivelMenus(id, data.menuIds);
    }

    // --- Menu_Acesso ---

    @Get('menus')
    findMenus() {
        return this.acessoService.findMenus();
    }

    @Post('menus')
    createMenu(@Body() data: CreateMenuAcessoDto) {
        return this.acessoService.createMenu(data);
    }

    @Put('menus/:id')
    updateMenu(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateMenuAcessoDto) {
        return this.acessoService.updateMenu(id, data);
    }

    @Delete('menus/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteMenu(@Param('id', ParseIntPipe) id: number) {
        return this.acessoService.deleteMenu(id);
    }

    @Get('users')
    findUsers() {
        return this.acessoService.findUsers();
    }

    @Patch('users/:id/nivel')
    updateUserNivel(
        @Param('id') id: string,
        @Body() data: UpdateUserNivelDto,
    ) {
        return this.acessoService.updateUserNivel(id, data.nivelAcessoId);
    }

    @Patch('users/:id/status')
    updateUserStatus(
        @Param('id') id: string,
        @Body() data: UpdateUserStatusDto, 
    ) {
        return this.acessoService.updateUserStatus(id, data.active);
    }
}