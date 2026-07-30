import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { QueueStatus } from '@prisma/client';
import { Menu } from 'src/auth/menu.decorator';
import { RefreshTokenGuard } from 'src/auth/refresh-token.guard';
import { CallTicketDto, CreateTicketDto } from './dto/fila.dto';
import { FilaService } from './fila.service';

@Controller('admin/fila')
@UseGuards(RefreshTokenGuard)
@Menu('fila')
export class FilaController {
    constructor(private readonly filaService: FilaService) { }

    @Get()
    findAll(
        @Query('status') status?: QueueStatus,
        @Query('grupoId') grupoId?: string,
        @Query('deleted') deleted?: string,
    ) {
        return this.filaService.findAll(status, grupoId ? Number(grupoId) : undefined, deleted === 'true');
    }

    @Get('stats')
    stats(@Query('grupoId') grupoId?: string) {
        return this.filaService.stats(grupoId ? Number(grupoId) : undefined);
    }

    @Post()
    @UsePipes(new ValidationPipe({ whitelist: true }))
    create(@Body() dto: CreateTicketDto) {
        return this.filaService.create(dto);
    }

    @Post(':id/chamar')
    @UsePipes(new ValidationPipe({ whitelist: true }))
    call(@Param('id') id: string, @Body() dto: CallTicketDto) {
        return this.filaService.call(id, dto);
    }

    @Post(':id/confirmar')
    confirm(@Param('id') id: string) {
        return this.filaService.confirm(id);
    }

    @Post(':id/concluir')
    finish(@Param('id') id: string, @Body('attendanceId') attendanceId?: string) {
        return this.filaService.finish(id, attendanceId);
    }

    @Post(':id/cancelar')
    cancel(@Param('id') id: string) {
        return this.filaService.cancel(id);
    }

    @Post(':id/faltou')
    miss(@Param('id') id: string) {
        return this.filaService.miss(id);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.filaService.remove(id);
    }

    @Post(':id/restaurar')
    restore(@Param('id') id: string) {
        return this.filaService.restore(id);
    }
}
