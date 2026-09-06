import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { User } from '@prisma/client';
import { GetUser } from 'src/auth/get-user.decorator';
import { Menu } from 'src/auth/menu.decorator';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsQuery } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@Menu('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  async create(@Body() dto: CreateNotificationDto, @GetUser() user: User) {
    const userId = user.idUser;
    return this.notifications.create(dto, userId);
  }

  @Get()
  async list(@Query() query: ListNotificationsQuery, @GetUser() user: User) {
    const userId = user.idUser;
    return this.notifications.listForUser(userId, query);
  }

  @Get('unread-count')
  async unreadCount(@GetUser() user: User) {
    const userId = user.idUser;
    const count = await this.notifications.unreadCount(userId);
    return { count };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string, @Body() body: { read?: boolean }, @GetUser() user: User) {
    const userId = user.idUser;
    await this.notifications.markRead(userId, id, body?.read ?? true);
    return { status: 204 };
  }

  @Patch(':id/confirm')
  async confirm(@Param('id') id: string, @GetUser() user: User) {
    await this.notifications.confirm(user.idUser, id);
    return { status: 204 };
  }

  @Patch('read-all')
  async markAllRead(
    @Body() body: { category?: string; before?: string },
    @GetUser() user: User,
  ) {
    const userId = user.idUser;
    await this.notifications.markAllRead(userId, body?.category, body?.before);
    return { status: 204 };
  }

  @Delete(':id')
  async archive(@Param('id') id: string, @GetUser() user: User) {
    const userId = user.idUser;
    await this.notifications.archive(userId, id);
    return { status: 204 };
  }
}
