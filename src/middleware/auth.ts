// src/middleware/auth.ts
// JWT authentication and role-based authorization middleware.
// Validates tokens locally using shared JWT_SECRET — no runtime call to auth-service.

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { sendError } from "../utils/response";

/**
 * authenticateInternalService
 * Validates service-to-service calls using a shared secret header.
 * Used by payment-service to update order status without a user JWT.
 */
export function authenticateInternalService(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const secret = req.headers["x-internal-secret"];
  if (!secret || secret !== env.INTERNAL_SERVICE_SECRET) {
    sendError(res, "Forbidden: invalid internal service secret", 403);
    return;
  }
  next();
}

export interface JwtPayload {
  sub:      string;   // user id
  username: string;
  role:     "admin" | "user";
  iat?:     number;
  exp?:     number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * authenticateJWT
 * Verifies Bearer token and attaches decoded payload to req.user.
 */
export function authenticateJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    sendError(res, "Authorization header missing or malformed", 401);
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    req.user = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      sendError(res, "Token has expired", 401);
    } else if (err instanceof jwt.JsonWebTokenError) {
      sendError(res, "Invalid token", 401);
    } else {
      sendError(res, "Authentication failed", 401);
    }
  }
}

/**
 * authorizeRole
 * Restricts access to specified roles.
 */
export function authorizeRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Not authenticated", 401);
      return;
    }
    if (!roles.includes(req.user.role)) {
      sendError(res, `Access denied. Required role(s): ${roles.join(", ")}`, 403);
      return;
    }
    next();
  };
}

/**
 * authorizeOwnerOrAdmin
 * Allows access only if req.user is the resource owner OR has admin role.
 * Pass the target userId (from route params or body) to compare against.
 */
export function authorizeOwnerOrAdmin(getTargetUserId: (req: Request) => string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, "Not authenticated", 401);
      return;
    }
    const targetUserId = getTargetUserId(req);
    if (req.user.role === "admin" || req.user.sub === targetUserId) {
      next();
    } else {
      sendError(res, "Access denied. You can only access your own resources.", 403);
    }
  };
}
