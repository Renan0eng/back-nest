import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module'; // Importe AuthModule para usar os Guards
import { DatabaseModule } from 'src/database/database.module'; // Ou PrismaModule
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule, 
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}