import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('admin/users') // Define uma rota base diferente de /admin/acesso
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Post()
    @UseGuards(RefreshTokenGuard)
    create(@Body() createUserDto: CreateUserDto) {
        return this.userService.create(createUserDto);
    }

    @Get()
    @UseGuards(RefreshTokenGuard)
    findAll() {
        const users = this.userService.findAll();
        return users;
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
    @HttpCode(HttpStatus.NO_CONTENT) // Retorna 204 No Content em caso de sucesso
    remove(@Param('id') id: string) {
        return this.userService.remove(id);
    }
}