import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const req = ctx.switchToHttp().getRequest();
    const raw =
      req.headers?.['idempotency-key'] ??
      req.headers?.['x-idempotency-key'] ??
      undefined;
    if (raw == null) return undefined;
    const value = Array.isArray(raw) ? raw[0] : String(raw);

    if (value.length === 0 || value.length > 200) {
      throw new BadRequestException('Idempotency-Key header must be 1–200 characters');
    }

    if (/[\x00-\x1F\x7F]/.test(value)) {
      throw new BadRequestException('Idempotency-Key header contains invalid characters');
    }
    return value;
  },
);
