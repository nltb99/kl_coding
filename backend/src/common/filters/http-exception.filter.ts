import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";
import { PinoLogger, InjectPinoLogger } from "nestjs-pino";

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(GlobalHttpExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : "Internal server error";

    const logCtx = {
      statusCode: status,
      path: request.url,
      method: request.method,
    };
    if (status >= 500) {
      this.logger.error({ err: exception, ...logCtx }, "Server error");
    } else {
      this.logger.warn(logCtx, "Client error");
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message:
        typeof message === "object" && "message" in (message as object)
          ? (message as any).message
          : message,
    });
  }
}
