import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { ProblemException } from './common/problem.exception';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';

function validationFields(
  errors: ValidationError[],
  parent = '',
): { field: string; message: string }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    return [
      ...Object.values(error.constraints ?? {}).map((message) => ({
        field,
        message,
      })),
      ...validationFields(error.children ?? [], field),
    ];
  });
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(cookieParser());
  app.use((request: Request, response: Response, next: NextFunction) => {
    if (
      ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ||
      !request.cookies?.mg_session
    )
      return next();
    const origin = request.get('origin');
    const allowedOrigins = (
      process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200'
    )
      .split(',')
      .map((value) => value.trim());
    const ownOrigin = `${request.protocol}://${request.get('host')}`;
    if (!origin || allowedOrigins.includes(origin) || origin === ownOrigin)
      return next();
    response
      .status(HttpStatus.FORBIDDEN)
      .type('application/problem+json')
      .json({
        title: 'Forbidden',
        status: HttpStatus.FORBIDDEN,
        code: 'INVALID_ORIGIN',
        detail: 'Origem não autorizada para uma requisição autenticada.',
      });
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new ProblemException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'VALIDATION_ERROR',
          'Um ou mais campos são inválidos.',
          validationFields(errors),
        ),
    }),
  );
  app.enableCors({
    origin: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200')
      .split(',')
      .map((value) => value.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Música da Glória API')
    .setDescription(
      'API pastoral multi-paróquia. Use o login para receber o cookie HttpOnly de sessão.',
    )
    .setVersion('1.0')
    .addCookieAuth(
      'mg_session',
      { type: 'apiKey', in: 'cookie' },
      'sessionCookie',
    )
    .addSecurityRequirements('sessionCookie')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: { persistAuthorization: false },
  });
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
