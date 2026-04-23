// src/services/blockchain.client.ts
// HTTP client for communicating with blockchain-service.

import { env } from "../config/env";
import logger from "../observability/logger";

export interface OrderBlockData {
  order_id: string;
  user_id: string;
  items: Array<{
    book_id: string;
    quantity: number;
    price: string;
  }>;
  total_price: number;
  status: string;
}

export const BlockchainClient = {
  /**
   * addOrderBlock
   * Sends order data to the blockchain-service to create an immutable block.
   */
  async addOrderBlock(data: OrderBlockData): Promise<void> {
    const url = `${env.BLOCKCHAIN_SERVICE_URL}/blockchain/order`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        // If it's a 409 Conflict, it means the order is already in the blockchain.
        // That is acceptable (idempotency). Otherwise, log as an error.
        if (res.status !== 409) {
          const text = await res.text();
          logger.error("blockchain_client_add_order_failed", { order_id: data.order_id, status: res.status, response: text });
        } else {
          logger.info("blockchain_client_add_order_duplicate", { order_id: data.order_id });
        }
        return;
      }

      logger.info("blockchain_client_add_order_success", { order_id: data.order_id });
    } catch (err) {
      logger.error("blockchain_client_add_order_error", { order_id: data.order_id, error: (err as Error).message });
      // Best-effort delivery. If blockchain is down, order creation shouldn't necessarily fail.
    }
  },
};
