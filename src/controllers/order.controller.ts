// src/controllers/order.controller.ts
// HTTP layer — parse/validate request, call service, send response.

import type { Request, Response, NextFunction } from "express";
import {
  OrderService,
  NotFoundError,
  ValidationError,
  ServiceUnavailableError,
} from "../services/order.service";
import {
  createOrderSchema,
  paginationSchema,
  updateOrderStatusSchema,
} from "../utils/validators";
import { sendSuccess, sendError } from "../utils/response";

export const OrderController = {

  /**
   * POST /orders
   * Create a new order for the authenticated user.
   */
  async createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, "Validation failed", 400, parsed.error.flatten());
        return;
      }

      const userId = req.user!.sub;
      const order  = await OrderService.createOrder(userId, parsed.data);
      sendSuccess(res, order, "Order created successfully", 201);

    } catch (err) {
      if (err instanceof ValidationError)        sendError(res, err.message, 422);
      else if (err instanceof ServiceUnavailableError) sendError(res, err.message, 503);
      else next(err);
    }
  },

  /**
   * GET /orders/:id
   * Get a single order. Access: owner or admin.
   */
  async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const order = await OrderService.getOrderById(req.params.id);

      // Ownership check: admin can access any order, user only their own
      if (req.user!.role !== "admin" && order.user_id !== req.user!.sub) {
        sendError(res, "Access denied. You can only access your own orders.", 403);
        return;
      }

      sendSuccess(res, order);
    } catch (err) {
      if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },

  /**
   * GET /orders/user/:userId
   * Get all orders for a user. Access: owner or admin.
   */
  async getUserOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Ownership check
      if (req.user!.role !== "admin" && req.params.userId !== req.user!.sub) {
        sendError(res, "Access denied. You can only access your own orders.", 403);
        return;
      }

      const parsed = paginationSchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(res, "Invalid pagination params", 400, parsed.error.flatten());
        return;
      }

      const result = await OrderService.getOrdersByUser(
        req.params.userId,
        parsed.data.page,
        parsed.data.limit
      );
      sendSuccess(res, result);

    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /orders/:id/status
   * Update order status. Admin only.
   */
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = updateOrderStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, "Validation failed", 400, parsed.error.flatten());
        return;
      }

      const order = await OrderService.updateOrderStatus(req.params.id, parsed.data.status);
      sendSuccess(res, order, "Order status updated");

    } catch (err) {
      if (err instanceof NotFoundError) sendError(res, err.message, 404);
      else next(err);
    }
  },
};
