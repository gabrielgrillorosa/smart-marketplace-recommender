package com.smartmarketplace.outbox;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartmarketplace.dto.OrderDTO;
import com.smartmarketplace.dto.OrderItemDTO;
import com.smartmarketplace.entity.Product;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class OutboxPublisher {

    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    public OutboxPublisher(OutboxEventRepository outboxEventRepository, ObjectMapper objectMapper) {
        this.outboxEventRepository = outboxEventRepository;
        this.objectMapper = objectMapper;
    }

    public void publishProductUpserted(Product product) {
        OutboxPayloads.ProductUpsertedEvent event = new OutboxPayloads.ProductUpsertedEvent(
                product.getId(),
                product.getSku(),
                product.getName(),
                product.getDescription(),
                product.getCategory(),
                product.getPrice(),
                product.getSupplier().getId(),
                product.getSupplier().getName(),
                product.getSupplier().getCountry().getCode().trim(),
                product.getCountries().stream()
                        .map(country -> country.getCode().trim())
                        .sorted()
                        .toList()
        );
        save("product", product.getId(), "product-upserted:" + product.getId(),
                IntegrationEventType.PRODUCT_UPSERTED_V1, event);
    }

    public void publishCheckoutCompleted(UUID clientId, OrderDTO order) {
        List<OutboxPayloads.CheckoutCompletedItem> items = order.items().stream()
                .map(this::toCheckoutItem)
                .toList();
        OutboxPayloads.CheckoutCompletedEvent event = new OutboxPayloads.CheckoutCompletedEvent(
                order.id(),
                clientId,
                Objects.requireNonNull(order.orderDate(), "orderDate").toString(),
                items
        );
        save("order", order.id(), "order-checkout-completed:" + order.id(),
                IntegrationEventType.ORDER_CHECKOUT_COMPLETED_V1, event);
    }

    private OutboxPayloads.CheckoutCompletedItem toCheckoutItem(OrderItemDTO item) {
        return new OutboxPayloads.CheckoutCompletedItem(
                item.productId(),
                item.quantity(),
                item.unitPrice()
        );
    }

    private void save(
            String aggregateType,
            UUID aggregateId,
            String eventKey,
            IntegrationEventType eventType,
            Object payload
    ) {
        try {
            String serializedPayload = objectMapper.writeValueAsString(payload);
            outboxEventRepository.save(
                    OutboxEventEntity.pending(eventType, aggregateType, aggregateId, eventKey, serializedPayload)
            );
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize outbox payload for " + eventType, e);
        }
    }
}
