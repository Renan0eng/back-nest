import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

/** Origens permitidas para o WebSocket (mesma lógica do CORS HTTP). */
function corsOrigins(): string[] {
    const corsEnv = process.env.CORS;
    return corsEnv
        ? corsEnv.split(',').map((s) => s.trim()).filter(Boolean)
        : ['https://prefeitura.renannardi.com'];
}

export type EscalaChange = {
    type: 'created' | 'updated' | 'deleted' | 'restored';
    id?: string;
};

export type CheckinReminder = {
    id: string;
    doctorId: string;
    notifiedAt: string;
};

export type QueueNotification = {
    doctorId: string;
    ticketId: string;
    code: string;
    status: string;
    setor: string;
};

/**
 * Gateway em tempo real da Escala de Plantão.
 *
 * Emite apenas um SINAL de mudança (sem dados sensíveis) — o cliente refaz o
 * fetch autenticado via HTTP, preservando as permissões por nível.
 */
@WebSocketGateway({
    namespace: 'escala',
    cors: { origin: corsOrigins(), credentials: true },
})
export class EscalaGateway {
    @WebSocketServer()
    server: Server;

    emitChange(change: EscalaChange) {
        // `server` pode não estar pronto em cenários de teste; o `?.` protege.
        this.server?.emit('escala:changed', change);
    }

    emitCheckinReminder(reminder: CheckinReminder) {
        this.server?.emit('escala:checkin-reminder', reminder);
    }

    emitQueueNotification(notification: QueueNotification) {
        this.server?.emit('fila:notificacao', notification);
    }
}
