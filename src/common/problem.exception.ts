import { HttpException, HttpStatus } from '@nestjs/common';

export class ProblemException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    detail: string,
    fieldErrors?: { field: string; message: string }[],
  ) {
    super(
      {
        title: HttpStatus[status],
        status,
        code,
        detail,
        ...(fieldErrors ? { fieldErrors } : {}),
      },
      status,
    );
  }
}
