// src/utils/validators.ts

import { z } from "zod";

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        book_id:  z.string().uuid("book_id must be a valid UUID"),
        quantity: z
          .number()
          .int("quantity must be an integer")
          .min(1, "quantity must be at least 1")
          .max(100, "quantity cannot exceed 100"),
      })
    )
    .min(1, "Order must contain at least one item")
    .max(20, "Order cannot contain more than 20 items"),
});

export const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELLED"]),
});

export type CreateOrderInput    = z.infer<typeof createOrderSchema>;
export type UpdateStatusInput   = z.infer<typeof updateOrderStatusSchema>;
