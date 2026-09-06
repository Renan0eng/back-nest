import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AppTokenGuard } from 'src/auth/app-token.guard';
import { Menu } from 'src/auth/menu.decorator';
import { LogExclusionRuleInput, LogsService } from './logs.service';

@Controller('logs')
@UseGuards(AppTokenGuard)
@Menu('log')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  list(@Query() query: Record<string, string>) { return this.logsService.findAll(this.parseQuery(query)); }

  @Get('analytics')
  analytics(@Query() query: Record<string, string>) { return this.logsService.analytics(this.parseQuery(query)); }

  @Get('exclusion-rules')
  listRules() { return this.logsService.listRules(); }

  @Post('exclusion-rules')
  createRule(@Body() input: LogExclusionRuleInput, @Req() req: Request) {
    return this.logsService.createRule(input, (req.user as any)?.idUser || (req.user as any)?.id);
  }

  @Patch('exclusion-rules/:id')
  updateRule(@Param('id') id: string, @Body() input: Partial<LogExclusionRuleInput>) { return this.logsService.updateRule(id, input); }

  @Delete('exclusion-rules/:id')
  deleteRule(@Param('id') id: string) { return this.logsService.deleteRule(id); }

  @Post('exclusion-rules/run')
  runRules() { return this.logsService.applyExclusionRules(); }

  @Get(':id')
  getOne(@Param('id') id: string) { return this.logsService.findOne(id); }

  @Post(':id/seen')
  markSeen(@Param('id') id: string) { return this.logsService.markAsSeen(id); }

  private parseQuery(query: Record<string, string>) {
    return { ...query, statusCode: query.statusCode ? Number(query.statusCode) : undefined, seen: query.seen === undefined ? undefined : query.seen === 'true' || query.seen === '1' };
  }
}
