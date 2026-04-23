// src/services/order.service.ts
// Business logic for order management.
// Coordinates between Prisma (DB) and BookClient (inter-service).

import prisma from "../db/prisma";
import { BookClient, BookNotFoundError, BookServiceUnavailableError } from "./book.client";
import { BlockchainClient } from "./blockchain.client";
import { orderOperationsTotal, orderTotalPrice } from "../observability/metrics";
import logger from "../observability/logger";
import type { CreateOrderInput } from "../utils/validators";

function recordOp(operation: string, status: "success" | "failure", extra?: object) {
  orderOperationsTotal.inc({ operation, status });
  const level = status === "success" ? "info" : "warn";
  logger[level](`order_${operation}`, { operation, status, ...extra });
}

export const OrderService = {

  /**
   * createOrder
   * Flow:
   *   1. Validate & deduplicate items
   *   2. Fetch each book from book-service (parallel)
   *   3. Validate stock
   *   4. Calculate total price
   *   5. Create order + order_items in a transaction
   */
  async createOrder(userId: string, input: CreateOrderInput) {
    // Deduplicate: merge items with same book_id
    const itemMap = new Map<string, number>();
    for (const item of input.items) {
      itemMap.set(item.book_id, (itemMap.get(item.book_id) ?? 0) + item.quantity);
    }
    const deduped = Array.from(itemMap.entries()).map(([book_id, quantity]) => ({
      book_id,
      quantity,
    }));

    // Fetch all books in parallel — fail fast if any book is not found
    const bookResults = await Promise.allSettled(
      deduped.map((item) => BookClient.getBook(item.book_id))
    );

    // Check for errors from book-service
    const books: Record<string, { title: string; price: number; stock: number }> = {};
    for (let i = 0; i < bookResults.length; i++) {
      const result = bookResults[i];
      const item   = deduped[i];

      if (result.status === "rejected") {
        recordOp("create", "failure", {
          reason: "book_fetch_failed",
          book_id: item.book_id,
          error: result.reason?.message,
        });
        if (result.reason instanceof BookNotFoundError) {
          throw new ValidationError(`Book ${item.book_id} does not exist`);
        }
        if (result.reason instanceof BookServiceUnavailableError) {
          throw new ServiceUnavailableError("Book service is temporarily unavailable. Please try again.");
        }
        throw result.reason;
      }

      const book = result.value;

      // Validate stock
      if (book.stock < item.quantity) {
        recordOp("create", "failure", {
          reason:    "insufficient_stock",
          book_id:   item.book_id,
          requested: item.quantity,
          available: book.stock,
        });
        throw new ValidationError(
          `Insufficient stock for "${book.title}". Requested: ${item.quantity}, Available: ${book.stock}`
        );
      }

      books[item.book_id] = {
        title: book.title,
        price: parseFloat(book.price),
        stock: book.stock,
      };
    }

    // Calculate total price
    const total = deduped.reduce((sum, item) => {
      return sum + books[item.book_id].price * item.quantity;
    }, 0);

    // Create order + items in a single transaction
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          user_id:     userId,
          total_price: total,
          status:      "PENDING",
          items: {
            create: deduped.map((item) => ({
              book_id:  item.book_id,
              quantity: item.quantity,
              price:    books[item.book_id].price,
            })),
          },
        },
        include: {
          items: true,
        },
      });
      return created;
    });

    orderTotalPrice.observe(total);
    recordOp("create", "success", {
      order_id:    order.id,
      user_id:     userId,
      total_price: total,
      item_count:  deduped.length,
    });

    // Notify blockchain asynchronously (fire-and-forget)
    BlockchainClient.addOrderBlock({
      order_id: order.id,
      user_id: userId,
      items: deduped.map(item => ({
        book_id: item.book_id,
        quantity: item.quantity,
        price: books[item.book_id].price.toString(),
      })),
      total_price: total,
      status: "PENDING",
    }).catch(err => {
      logger.error("Failed to add order to blockchain", { error: err });
    });

    return order;
  },

  /**
   * getOrderById
   * Returns a single order with its items.
   */
  async getOrderById(orderId: string) {
    const order = await prisma.order.findUnique({
      where:   { id: orderId },
      include: { items: true },
    });

    if (!order) {
      recordOp("get", "failure", { reason: "not_found", order_id: orderId });
      throw new NotFoundError("Order not found");
    }

    recordOp("get", "success", { order_id: orderId });
    return order;
  },

  /**
   * getOrdersByUser
   * Returns paginated orders for a specific user.
   */
  async getOrdersByUser(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where:   { user_id: userId },
        skip,
        take:    limit,
        orderBy: { created_at: "desc" },
        include: { items: true },
      }),
      prisma.order.count({ where: { user_id: userId } }),
    ]);

    recordOp("list", "success", { user_id: userId, page, total });
    return {
      orders,
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  },

  /**
   * getAllOrders
   * Admin-only: returns paginated list of all orders.
   */
  async getAllOrders(page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        skip,
        take:    limit,
        orderBy: { created_at: "desc" },
        include: { items: true },
      }),
      prisma.order.count(),
    ]);

    recordOp("list_all", "success", { page, total });
    return {
      orders,
      pagination: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  },

  /**
   * updateOrderStatus
   * Admin-only: update order status.
   */
  async updateOrderStatus(orderId: string, status: "PENDING" | "PAID" | "CANCELLED" | "EXPIRED") {
    const existing = await prisma.order.findUnique({ 
      where: { id: orderId },
      include: { items: true }
    });
    if (!existing) throw new NotFoundError("Order not found");

    const updated = await prisma.order.update({
      where: { id: orderId },
      data:  { status },
      include: { items: true },
    });

    if (status === "PAID" && existing.status !== "PAID") {
      // Best effort stock deduction.
      await Promise.allSettled(
        updated.items.map(item => BookClient.deductStock(item.book_id, item.quantity))
      );
    }

    recordOp("update_status", "success", { order_id: orderId, status });
    return updated;
  },
};

// ── Custom Errors ─────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  constructor(m: string) { super(m); this.name = "NotFoundError"; }
}
export class ValidationError extends Error {
  constructor(m: string) { super(m); this.name = "ValidationError"; }
}
export class ServiceUnavailableError extends Error {
  constructor(m: string) { super(m); this.name = "ServiceUnavailableError"; }
}
