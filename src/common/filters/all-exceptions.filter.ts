import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from 'src/auth/auth.service';
import { LogsService } from 'src/logs/logs.service';

@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private logsService: LogsService, private authService: AuthService) {}

  async catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = (() => {
      if (exception instanceof HttpException) {
        const resp = exception.getResponse();
        if (typeof resp === 'string') return resp;
        if (typeof resp === 'object' && (resp as any).message) return (resp as any).message;
        return exception.message;
      }
      return exception?.message || 'Internal server error';
    })();

    const stack = exception?.stack;

    // try to parse file/line/column from stack trace
    let file: string | null = null;
    let line: number | null = null;
    let column: number | null = null;
    if (stack) {
      const m = stack.match(/\(([^:]+):(\d+):(\d+)\)/) || stack.match(/at ([^:]+):(\d+):(\d+)/);
      if (m) {
        file = m[1];
        line = parseInt(m[2], 10);
        column = parseInt(m[3], 10);
      }
    }

    // try to determine user
    let userId: string | null = null;
    let userEmail: string | null = null;
    try {
      if ((req as any).user) {
        const u = (req as any).user as any;
        userId = u.idUser || u.id || u.sub || null;
        userEmail = u.email || null;
      } else {
        // try token from header or cookie
        let token: string | undefined = undefined;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
          token = req.headers.authorization.split(' ')[1];
        } else if ((req as any).cookies && (req as any).cookies['refresh_token']) {
          token = (req as any).cookies['refresh_token'];
        }

        if (token) {
          try {
            const validated = await this.authService.validateToken(token, { type: 'any' });
            userId = validated?.dataToken?.sub || null;
            try {
              if (userId) {
                const user = await this.authService.findUserById(userId as string);
                userEmail = user?.email || null;
              }
            } catch (e) {
              // ignore
            }
          } catch (e) {
            // token invalid - ignore
          }
        }
      }
    } catch (e) {
      // best-effort only
      this.logger.debug('Error while extracting user for error log: ' + (e as any)?.message);
    }

    // prepare metadata (avoid huge bodies)
    const metadata: any = {
      headers: req.headers,
      params: req.params,
      query: req.query,
    };

    try {
      // try to include small request body if present
      if (req.body) {
        const body = req.body;
        // only include up to 10KB of JSON to avoid huge entries
        try {
          const json = JSON.stringify(body);
          metadata.body = json.length > 10240 ? json.slice(0, 10240) + '...[truncated]' : body;
        } catch (e) {
          metadata.body = '[unserializable]';
        }
      }
    } catch (e) {
      // ignore
    }

    // log to terminal
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    this.logger.error(`[${req.method}] ${req.originalUrl || req.url} → ${status} | ${messageStr}`);
    if (userId) this.logger.error(`  User: ${userId} (${userEmail || 'unknown'})`);
    if (stack && status >= 500) this.logger.error(stack);

    // write to DB (best-effort)
    try {
      // capture network/client details
      const ip = req.ip || (req.headers['x-forwarded-for'] as string) || (req.socket && (req.socket as any).remoteAddress) || null;
      const forwardedFor = (req.headers['x-forwarded-for'] as string) || null;
      const userAgent = (req.headers['user-agent'] as string) || null;

      // attach some of these to metadata too (best-effort)
      metadata.client = {
        ip,
        forwardedFor,
        userAgent,
        protocol: req.protocol,
        httpVersion: (req as any).httpVersion,
        remoteAddress: (req.socket && (req.socket as any).remoteAddress) || null,
        secure: (req as any).secure || false,
      };

      await this.logsService.create({
          message: typeof message === 'string' ? message : JSON.stringify(message),
          stack: stack,
          method: req.method,
          route: req.originalUrl || req.url,
          statusCode: status,
          userId: userId,
          userEmail: userEmail,
          ip: ip,
          forwardedFor: forwardedFor,
          userAgent: userAgent,
          file: file,
          line: line,
          column: column,
          metadata: metadata,
      });
    } catch (e) {
      // If DB write fails, log to console so we don't lose the information
      this.logger.error('Failed to persist error log: ' + (e as any)?.message);
      this.logger.error('Original error: ' + message);
      if (stack) this.logger.error(stack);
    }

    const safeBody = {
      statusCode: status,
      message: Array.isArray(message) ? message : message,
    };

    res.status(status).json(safeBody);
  }
}
