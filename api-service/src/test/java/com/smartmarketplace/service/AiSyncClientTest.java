package com.smartmarketplace.service;

import com.smartmarketplace.dto.ProductDetailDTO;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

class AiSyncClientTest {

    @Test
    void buildPayload_escapesTextAndIncludesCountries() {
        AiSyncClient client = new AiSyncClient("http://localhost:9999");
        ProductDetailDTO product = sampleProduct("Café \"Especial\"", "Linha 1\nLinha 2\tFim");

        String payload = client.buildPayload(product);

        assertThat(payload).contains("\\\"Especial\\\"");
        assertThat(payload).contains("Linha 1\\nLinha 2\\tFim");
        assertThat(payload).contains("\"countryCodes\":[\"BR\",\"MX\"]");
    }

    @Test
    void notifyProductCreated_postsToExpectedEndpoint() throws Exception {
        AtomicReference<String> pathRef = new AtomicReference<>();
        AtomicReference<String> bodyRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        HttpServer server = startServer(200, pathRef, bodyRef, latch);
        try {
            AiSyncClient client = new AiSyncClient("http://localhost:" + server.getAddress().getPort());
            ProductDetailDTO product = sampleProduct("Sync Product", "Descrição");

            client.notifyProductCreated(product);

            assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(pathRef.get()).isEqualTo("/api/v1/embeddings/sync-product");
            assertThat(bodyRef.get()).contains(product.id().toString());
            assertThat(bodyRef.get()).contains("\"name\":\"Sync Product\"");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void notifyCheckoutCompleted_postsToExpectedEndpoint() throws Exception {
        AtomicReference<String> pathRef = new AtomicReference<>();
        AtomicReference<String> bodyRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        HttpServer server = startServer(202, pathRef, bodyRef, latch);
        try {
            AiSyncClient client = new AiSyncClient("http://localhost:" + server.getAddress().getPort());
            UUID orderId = UUID.randomUUID();
            UUID clientId = UUID.randomUUID();
            List<UUID> productIds = List.of(UUID.randomUUID(), UUID.randomUUID());

            client.notifyCheckoutCompleted(orderId, clientId, productIds);

            assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(pathRef.get()).isEqualTo("/api/v1/orders/" + orderId + "/sync-and-train");
            assertThat(bodyRef.get()).contains("\"clientId\":\"" + clientId + "\"");
            assertThat(bodyRef.get()).contains(productIds.get(0).toString());
            assertThat(bodyRef.get()).contains(productIds.get(1).toString());
        } finally {
            server.stop(0);
        }
    }

    private static ProductDetailDTO sampleProduct(String name, String description) {
        return new ProductDetailDTO(
                UUID.randomUUID(),
                "SKU-123",
                name,
                "food",
                new BigDecimal("12.90"),
                "Supplier X",
                List.of("BR", "MX"),
                description,
                UUID.randomUUID(),
                LocalDateTime.now()
        );
    }

    private static HttpServer startServer(
            int statusCode,
            AtomicReference<String> pathRef,
            AtomicReference<String> bodyRef,
            CountDownLatch latch
    ) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        server.createContext("/", exchange -> {
            pathRef.set(exchange.getRequestURI().getPath());
            bodyRef.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] response = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(statusCode, response.length);
            exchange.getResponseBody().write(response);
            exchange.close();
            latch.countDown();
        });
        server.start();
        return server;
    }
}
