import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PushService } from '../push/push.service';
import { CreateNotificationDto, TargetsDto } from './dto/create-notification.dto';
import { ListNotificationsQuery } from './dto/list-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  async create(dto: CreateNotificationDto, createdById?: string) {
    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title,
        body: dto.body,
        data: dto.data as any,
        category: dto.category,
        priority: dto.priority ?? 0,
        createdById,
      },
    });

    const recipients = await this.resolveTargets(dto.targets);
    if (recipients.length) {
      await this.prisma.userNotification.createMany({
        data: recipients.map((userId) => ({ userId, notificationId: notification.id })),
        skipDuplicates: true,
      });
    }

    if (dto.sendPush) {
      // fire-and-forget; do not await all
      void this.sendPushForNotification(notification.id);
    }

    return { notificationId: notification.id, recipients: recipients.length };
  }

  private async resolveTargets(targets?: TargetsDto): Promise<string[]> {
    if (!targets) return [];
    const userIds = new Set<string>();
    if (targets.userIds?.length) targets.userIds.forEach((id) => userIds.add(id));

    // TODO: roles/filters resolution if needed. Keeping minimal for now.
    return Array.from(userIds);
  }

  async listForUser(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<{ items: any[]; nextCursor?: string }> {
    const take = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const where: any = { userId };
    if (query.status) where.status = query.status;
    if (query.category) where.notification = { category: query.category };

    const cursorFilter: any = {};
    if (query.after) {
      const parsed = this.parseCursor(query.after);
      if (parsed) {
        cursorFilter.OR = [
          { createdAt: { lt: parsed.createdAt } },
          {
            createdAt: parsed.createdAt,
            id: { lt: parsed.id },
          },
        ];
      }
    }

    const rows = await this.prisma.userNotification.findMany({
      where: { ...where, ...cursorFilter },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
      include: { notification: true },
    });

    const items = rows.map((r) => ({
      id: r.notificationId,
      title: r.notification.title,
      body: r.notification.body,
      data: r.notification.data,
      status: r.status,
      category: r.notification.category,
      priority: r.notification.priority,
      createdAt: r.notification.createdAt,
      readAt: r.readAt ?? null,
      confirmedAt: r.confirmedAt ?? null,
    }));

    const nextCursor = rows.length === take
      ? this.makeCursor(rows[rows.length - 1].createdAt, rows[rows.length - 1].id)
      : undefined;

    return { items, nextCursor };
  }

  async confirm(userId: string, notificationId: string) {
    const now = new Date();
    await this.prisma.userNotification.update({
      where: { notificationId_userId: { notificationId, userId } },
      data: { status: 'READ' as any, readAt: now, confirmedAt: now },
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.userNotification.count({ where: { userId, status: 'UNREAD' as any } });
  }

  async markRead(userId: string, notificationId: string, read: boolean) {
    const now = new Date();
    await this.prisma.userNotification.update({
      where: { notificationId_userId: { notificationId, userId } },
      data: read
        ? { status: 'READ' as any, readAt: now }
        : { status: 'UNREAD' as any, readAt: null },
    });
  }

  async markAllRead(userId: string, category?: string, before?: string) {
    const where: any = { userId };
    if (category) where.notification = { category };
    if (before) where.createdAt = { lt: new Date(before) };

    await this.prisma.userNotification.updateMany({
      where,
      data: { status: 'READ' as any, readAt: new Date() },
    });
  }

  async archive(userId: string, notificationId: string) {
    await this.prisma.userNotification.update({
      where: { notificationId_userId: { notificationId, userId } },
      data: { status: 'ARCHIVED' as any },
    });
  }

  async sendPushForNotification(notificationId: string) {
    const recipients = await this.prisma.userNotification.findMany({
      where: { notificationId },
      include: { user: true, notification: true },
    });

    for (const r of recipients) {
      // Construir payload com tipos corretos
      const data: Record<string, string> = {};
      
      // Converter data para Record<string, string>
      if (r.notification.data && typeof r.notification.data === 'object') {
        for (const [key, value] of Object.entries(r.notification.data)) {
          data[key] = String(value);
        }
      }

      const payload = {
        title: r.notification.title,
        body: r.notification.body || 'Nova notificação',
        data: Object.keys(data).length > 0 ? data : undefined,
      };

      const ok = await this.push.sendToUser(r.userId, payload);
      if (ok) {
        await this.prisma.userNotification.update({
          where: { notificationId_userId: { notificationId, userId: r.userId } },
          data: { deliveredAt: new Date() },
        });
      }
    }
  }

  private makeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt, id })).toString('base64');
  }

  private parseCursor(cursor?: string): { createdAt: Date; id: string } | null {
    if (!cursor) return null;
    try {
      const obj = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
      return { createdAt: new Date(obj.createdAt), id: obj.id };
    } catch {
      return null;
    }
  }
}
