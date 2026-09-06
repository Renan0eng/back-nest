import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Request } from 'express';
import { Menu } from '../auth/menu.decorator';
import { RefreshTokenGuard } from '../auth/refresh-token.guard';
import { CampaignDto } from './dto/campaign.dto';
import { CampanhasService } from './campanhas.service';

@Controller('admin/campanhas') @UseGuards(RefreshTokenGuard) @Menu('campanhas-vacinacao')
export class CampanhasController {
  constructor(private service: CampanhasService) {}
  @Get() list() { return this.service.list(); }
  @Post() @UsePipes(new ValidationPipe({ whitelist: true })) create(@Body() dto: CampaignDto, @Req() req: Request) { return this.service.create(dto, (req.user as any)?.idUser); }
  @Put(':id') @UsePipes(new ValidationPipe({ whitelist: true })) update(@Param('id') id: string, @Body() dto: CampaignDto) { return this.service.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
