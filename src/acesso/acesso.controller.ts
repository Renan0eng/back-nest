import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { AcessoService } from './acesso.service';
import { CreateMenuAcessoDto, CreateNivelAcessoDto, UpdateMenuAcessoDto, UpdateNivelAcessoDto, UpdateNivelMenusDto, UpdateUserNivelDto } from './dto/acesso.dto';
import { UpdateUserStatusDto } from './dto/update-user.dto';

@Controller('admin/acesso')
export class AcessoController {
    constructor(private readonly acessoService: AcessoService) { }

    @Get('niveis')
    @UseGuards(RefreshTokenGuard)
    findNiveis() {
        return this.acessoService.findNiveisComMenus(); 
    }

    @Post('niveis')
    @UseGuards(RefreshTokenGuard)
    createNivel(@Body() data: CreateNivelAcessoDto) {
        return this.acessoService.createNivel(data);
    }

    @Put('niveis/:id')
    @UseGuards(RefreshTokenGuard)
    updateNivel(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateNivelAcessoDto) {
        return this.acessoService.updateNivel(id, data);
    }

    @Delete('niveis/:id')
    @UseGuards(RefreshTokenGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteNivel(@Param('id', ParseIntPipe) id: number) {
        return this.acessoService.deleteNivel(id);
    }

    @Put('niveis/:id/menus')
    @UseGuards(RefreshTokenGuard)
    updateNivelMenus(
        @Param('id', ParseIntPipe) id: number,
        @Body() data: UpdateNivelMenusDto, 
    ) {
        return this.acessoService.updateNivelMenus(id, data.menuIds);
    }

    @Get('menus')
    @UseGuards(RefreshTokenGuard)
    findMenus() {
        return this.acessoService.findMenus();
    }

    @Post('menus')
    @UseGuards(RefreshTokenGuard)
    createMenu(@Body() data: CreateMenuAcessoDto) {
        return this.acessoService.createMenu(data);
    }

    @Put('menus/:id')
    @UseGuards(RefreshTokenGuard)
    updateMenu(@Param('id', ParseIntPipe) id: number, @Body() data: UpdateMenuAcessoDto) {
        return this.acessoService.updateMenu(id, data);
    }

    @Delete('menus/:id')
    @UseGuards(RefreshTokenGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    deleteMenu(@Param('id', ParseIntPipe) id: number) {
        return this.acessoService.deleteMenu(id);
    }

    @Get('users')
    @UseGuards(RefreshTokenGuard)
    findUsers() {
        return this.acessoService.findUsers();
    }

    @Patch('users/:id/nivel')
    @UseGuards(RefreshTokenGuard)
    updateUserNivel(
        @Param('id') id: string,
        @Body() data: UpdateUserNivelDto,
    ) {
        return this.acessoService.updateUserNivel(id, data.nivelAcessoId);
    }

    @Patch('users/:id/status')
    @UseGuards(RefreshTokenGuard)
    updateUserStatus(
        @Param('id') id: string,
        @Body() data: UpdateUserStatusDto, 
    ) {
        return this.acessoService.updateUserStatus(id, data.active);
    }
}