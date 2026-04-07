// src/routes/order.routes.ts

import { Router } from "express";
import { OrderController } from "../controllers/order.controller";
import { authenticateJWT, authorizeRole } from "../middleware/auth";

const router = Router();

// ── All order routes require authentication ───────────────────────────────────

/**
 * POST /orders
 * Create order — any authenticated user
 */
router.post("/", authenticateJWT, OrderController.createOrder);

/**
 * GET /orders/user/:userId
 * Get orders by user — owner or admin
 * NOTE: must be declared BEFORE /orders/:id to avoid route conflict
 */
router.get("/user/:userId", authenticateJWT, OrderController.getUserOrders);

/**
 * GET /orders/:id
 * Get single order — owner or admin
 */
router.get("/:id", authenticateJWT, OrderController.getOrder);

/**
 * PATCH /orders/:id/status
 * Update order status — admin only
 */
router.patch(
  "/:id/status",
  authenticateJWT,
  authorizeRole("admin"),
  OrderController.updateStatus
);

export default router;
