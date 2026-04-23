// src/routes/order.routes.ts

import { Router } from "express";
import { OrderController } from "../controllers/order.controller";
import { authenticateJWT, authorizeRole, authenticateInternalService } from "../middleware/auth";

const router = Router();

// ── All order routes require authentication ───────────────────────────────────

/**
 * GET /orders
 * Get all orders — admin only
 */
router.get("/", authenticateJWT, authorizeRole("admin"), OrderController.getAllOrders);

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
 * Update order status — admin or owner (owner can only cancel)
 */
router.patch(
  "/:id/status",
  authenticateJWT,
  OrderController.updateStatus
);

/**
 * PATCH /orders/:id/internal-status
 * Update order status — internal service-to-service only (payment-service).
 * Protected by shared secret header (x-internal-secret), not JWT.
 */
router.patch(
  "/:id/internal-status",
  authenticateInternalService,
  OrderController.updateStatus
);

export default router;
