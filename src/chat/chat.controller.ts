import {
    Body,
    BadRequestException,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    Req,
    UnauthorizedException,
    UseGuards,
    UseInterceptors,
    UsePipes,
    ValidationPipe,
    UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AppTokenGuard } from 'src/auth/app-token.guard';
import { AuthService } from 'src/auth/auth.service';
import { Menu } from 'src/auth/menu.decorator';
import { ChatService } from './chat.service';
import { CreateChatDto } from './dto/create-chat.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('chats')
@Menu('chat-ai')
@UseGuards(AppTokenGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly authService: AuthService,
  ) {}

  // ============================================
  // ANALYTICS (must come before :chatId routes)
  // ============================================

  @Get('analytics')
  async getAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('triggerName') triggerName?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
  ) {
    return this.chatService.getChatAnalytics({
      startDate,
      endDate,
      triggerName,
      type,
      userId,
    });
  }

  @Get('analytics/types')
  async getLogTypes() {
    return this.chatService.getChatLogTypes();
  }

  @Get('analytics/triggers')
  async getDistinctTriggers() {
    return this.chatService.getDistinctTriggerNames();
  }

  @Post('assistant/form-builder')
  @Menu('formulario-ia')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 5 * 1024 * 1024 } }))
  async assistFormBuilder(
    @Body('content') content: string,
    @Body('form') form: string,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    let parsedForm: unknown;
    try {
      parsedForm = JSON.parse(form);
    } catch {
      throw new BadRequestException('O rascunho do formulário é inválido.');
    }
    return this.chatService.assistFormBuilder(content, parsedForm, files);
  }

  private async getUserIdFromRequest(req: Request): Promise<string> {
    // AppTokenGuard aceita Bearer e refresh_token, e já anexa o usuário.
    // Priorizar esse valor evita rejeitar uma sessão válida baseada em cookie.
    const guardedUserId = (req as any).user?.idUser;
    if (guardedUserId) return guardedUserId;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token não fornecido');
    }

    const token = authHeader.split(' ')[1];
    const decoded = await this.authService.validateToken(token, { type: 'access' });
    if (!decoded?.valid || !decoded?.dataToken?.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    return decoded.dataToken.sub;
  }

  @Post()
  @UsePipes(new ValidationPipe())
  async createChat(
    @Req() req: Request,
    @Body() dto: CreateChatDto,
  ) {
    const userId = await this.getUserIdFromRequest(req);
    return this.chatService.createChat(userId, dto);
  }

  @Get()
  async getUserChats(@Req() req: Request) {
    const userId = await this.getUserIdFromRequest(req);
    return this.chatService.getUserChats(userId);
  }

  @Get(':chatId')
  async getChat(
    @Req() req: Request,
    @Param('chatId') chatId: string,
  ) {
    const userId = await this.getUserIdFromRequest(req);
    return this.chatService.getChat(chatId, userId);
  }

  @Post(':chatId/messages')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: 5 * 1024 * 1024 } }))
  @UsePipes(new ValidationPipe())
  async addMessage(
    @Req() req: Request,
    @Param('chatId') chatId: string,
    @Body() dto: CreateMessageDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    const userId = await this.getUserIdFromRequest(req);
    return this.chatService.addMessage(chatId, userId, dto, files);
  }

  @Delete(':chatId')
  async deleteChat(
    @Req() req: Request,
    @Param('chatId') chatId: string,
  ) {
    const userId = await this.getUserIdFromRequest(req);
    return this.chatService.deleteChat(chatId, userId);
  }

  @Post(':chatId/clear')
  async clearChat(
    @Req() req: Request,
    @Param('chatId') chatId: string,
  ) {
    const userId = await this.getUserIdFromRequest(req);
    return this.chatService.clearChat(chatId, userId);
  }
}
