package com.smartmarketplace.outbox;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public final class OutboxPayloads {

    private OutboxPayloads() {
    }

    public record ProductUpsertedEvent(
            UUID productId,
            String sku,
            String name,
            String description,
            String category,
            BigDecimal price,
            UUID supplierId,
            String supplierName,
            String supplierCountryCode,
            List<String> countryCodes
    ) {
    }

    public record CheckoutCompletedItem(
            UUID productId,
            int quantity,
            BigDecimal unitPrice
    ) {
    }

    public record CheckoutCompletedEvent(
            UUID orderId,
            UUID clientId,
            String orderDate,
            List<CheckoutCompletedItem> items
    ) {
    }
}
