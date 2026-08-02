import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { Menu } from 'src/auth/menu.decorator';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('admin/users')
@Menu('gerenciar-usuarios')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly authService: AuthService,
    ) { }

    @Post()
    @UseGuards(RefreshTokenGuard)
    create(@Body() createUserDto: CreateUserDto, @Req() req: Request) {
        return this.userService.create(createUserDto, (req.user as any)?.idUser);
    }

    @Get()
    @UseGuards(RefreshTokenGuard)
    findAll(
        @Query('page') page?: string,
        @Query('pageSize') pageSize?: string,
        @Query('name') name?: string,
        @Query('accessLevel') accessLevel?: string,
        @Query('type') type?: string,
        @Query('active') active?: string,
        @Query('deleted') deleted?: string,
    ) {
        const p = page ? parseInt(page, 10) : undefined;
        const ps = pageSize ? parseInt(pageSize, 10) : undefined;

        const filters: any = {};
        if (deleted === 'true') filters.deleted = true;
        if (name) filters.name = name;
        if (accessLevel) {
            const al = parseInt(accessLevel, 10);
            if (!isNaN(al)) filters.accessLevel = al;
        }
        if (type) filters.type = type;
        if (typeof active !== 'undefined') {
            if (active === 'true') filters.active = true;
            else if (active === 'false') filters.active = false;
        }

        // preserve backward compatibility: if no pagination provided, service returns array
        return this.userService.findAll(p || ps ? { page: p, pageSize: ps, filters } : { filters } as any);
    }

    @Get(':id')
    @UseGuards(RefreshTokenGuard) // Ou 'editar' se só quem edita pode ver detalhes
    findOne(@Param('id') id: string) {
        return this.userService.findOne(id);
    }

    // Use PUT para substituição completa ou PATCH para parcial. Vou usar PUT aqui.
    @Put(':id')
    @UseGuards(RefreshTokenGuard)
    update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
        return this.userService.update(id, updateUserDto);
    }

    @Delete(':id')
    @UseGuards(RefreshTokenGuard)
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id') id: string) {
        return this.userService.remove(id);
    }

    @Post(':id/restaurar')
    @UseGuards(RefreshTokenGuard)
    restore(@Param('id') id: string) {
        return this.userService.restore(id);
    }

    @Post(':id/welcome')
    @UseGuards(RefreshTokenGuard)
    sendWelcome(@Param('id') id: string) {
        return this.authService.sendWelcomeEmail(id);
    }
}
