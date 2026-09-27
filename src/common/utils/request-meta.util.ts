import { Request } from 'express';

export interface ClientMeta {
  ipAddress?: string;
  userAgent?: string;
}

export function getClientMeta(request: Request): ClientMeta {
  return {
    ipAddress: request.ip,
    userAgent: request.headers['user-agent']?.slice(0, 512),
  };
}
