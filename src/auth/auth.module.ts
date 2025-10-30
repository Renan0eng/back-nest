import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { DatabaseModule } from '../database/database.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokenGuard } from './refresh-token.guard';

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'SECRET_KEY',
      signOptions: { expiresIn: '8h' }, 
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenGuard
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    JwtModule,
    RefreshTokenGuard
  ]
})
export class AuthModule {}
