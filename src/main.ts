// src/main.ts
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());

  app.enableCors({
    origin: process.env.CORS || 'http://localhost:3000',
    // origin: process.env.CORS || 'https://prefeitura.renannardi.com',
    credentials: true,
  });

  app.use(cookieParser());

  await app.listen(process.env.PORT || 4000);
}
bootstrap();