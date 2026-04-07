// src/utils/response.ts

import type { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): void {
  const body: Record<string, unknown> = { success: true, data };
  if (message) body.message = message;
  res.status(statusCode).json(body);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 500,
  details?: unknown
): void {
  const body: Record<string, unknown> = { success: false, error };
  if (details && process.env.NODE_ENV !== "production") body.details = details;
  res.status(statusCode).json(body);
}
