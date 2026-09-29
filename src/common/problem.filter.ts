import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const traceId = randomUUID();
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
    if (status >= 500) {
      const details =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(
        `[${traceId}] ${request.method} ${request.originalUrl}`,
        details,
      );
    }
    response
      .status(status)
      .type('application/problem+json')
      .json({
        title: HttpStatus[status],
        status,
        code: status === 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR',
        ...body,
        traceId,
      });
  }
}
