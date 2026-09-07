import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { AppTokenGuard } from './app-token.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MenuPermissionGuard } from './menu-permission.guard';
import { RefreshTokenGuard } from './refresh-token.guard';
import { getJwtSecrets } from '../config/jwt-secrets';

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    MailModule,
    JwtModule.register({
      secret: getJwtSecrets().legacy,
      signOptions: { expiresIn: '8h' },
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenGuard,
    // Menu permission guard (used globally from main.ts)
    // Provided here so it can inject AuthService and Reflector
    MenuPermissionGuard,
    AppTokenGuard,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    JwtModule,
    RefreshTokenGuard,
    AppTokenGuard,
    MenuPermissionGuard,
  ]
})
export class AuthModule {}

