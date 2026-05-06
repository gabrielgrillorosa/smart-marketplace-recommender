package com.smartmarketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartmarketplace.dto.OrderDTO;
import com.smartmarketplace.dto.OrderItemDTO;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.entity.Supplier;
import com.smartmarketplace.outbox.IntegrationEventType;
import com.smartmarketplace.outbox.OutboxEventEntity;
import com.smartmarketplace.outbox.OutboxEventRepository;
import com.smartmarketplace.outbox.OutboxPublisher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class OutboxPublisherTest {

    @Mock
    private OutboxEventRepository outboxEventRepository;

    @Test
    void publishProductUpserted_persistsCanonicalProductEvent() {
        OutboxPublisher publisher = new OutboxPublisher(outboxEventRepository, new ObjectMapper());

        Country country = new Country();
        country.setCode("BR");
        Supplier supplier = new Supplier();
        supplier.setId(UUID.randomUUID());
        supplier.setName("Acme");
        supplier.setCountry(country);
        Product product = new Product();
        product.setId(UUID.randomUUID());
        product.setSku("SKU-1");
        product.setName("Organic Juice");
        product.setDescription("A long enough description for the product payload.");
        product.setCategory("beverages");
        product.setPrice(new BigDecimal("19.90"));
        product.setSupplier(supplier);
        product.setCountries(Set.of(country));

        publisher.publishProductUpserted(product);

        ArgumentCaptor<OutboxEventEntity> captor = ArgumentCaptor.forClass(OutboxEventEntity.class);
        verify(outboxEventRepository).save(captor.capture());
        OutboxEventEntity saved = captor.getValue();
        assertThat(saved.getEventType()).isEqualTo(IntegrationEventType.PRODUCT_UPSERTED_V1);
        assertThat(saved.getEventKey()).isEqualTo("product-upserted:" + product.getId());
        assertThat(saved.getPayload()).contains("\"productId\":\"" + product.getId() + "\"");
        assertThat(saved.getPayload()).contains("\"supplierName\":\"Acme\"");
    }

    @Test
    void publishCheckoutCompleted_persistsCheckoutEvent() {
        OutboxPublisher publisher = new OutboxPublisher(outboxEventRepository, new ObjectMapper());
        UUID clientId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        OrderDTO order = new OrderDTO(
                orderId,
                LocalDateTime.of(2025, 5, 5, 10, 0),
                new BigDecimal("42.00"),
                List.of(new OrderItemDTO(productId, "Product", 2, new BigDecimal("21.00")))
        );

        publisher.publishCheckoutCompleted(clientId, order);

        ArgumentCaptor<OutboxEventEntity> captor = ArgumentCaptor.forClass(OutboxEventEntity.class);
        verify(outboxEventRepository).save(captor.capture());
        OutboxEventEntity saved = captor.getValue();
        assertThat(saved.getEventType()).isEqualTo(IntegrationEventType.ORDER_CHECKOUT_COMPLETED_V1);
        assertThat(saved.getEventKey()).isEqualTo("order-checkout-completed:" + orderId);
        assertThat(saved.getPayload()).contains("\"clientId\":\"" + clientId + "\"");
        assertThat(saved.getPayload()).contains("\"quantity\":2");
    }
}
