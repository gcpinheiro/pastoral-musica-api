import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Response } from 'express';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const source =
      exception instanceof HttpException ? exception.getResponse() : null;
    const body =
      typeof source === 'object' && source !== null
        ? source
        : { detail: String(source ?? 'Erro interno') };
    response
      .status(status)
      .type('application/problem+json')
      .json({
        title: HttpStatus[status],
        status,
        code: status === 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR',
        ...body,
        traceId: randomUUID(),
      });
  }
}
