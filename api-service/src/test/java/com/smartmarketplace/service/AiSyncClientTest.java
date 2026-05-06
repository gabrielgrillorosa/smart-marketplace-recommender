package com.smartmarketplace.service;

import com.smartmarketplace.outbox.IntegrationEventType;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiSyncClientTest {

    @Test
    void dispatch_productUpserted_postsToExpectedEndpoint() throws Exception {
        AtomicReference<String> pathRef = new AtomicReference<>();
        AtomicReference<String> bodyRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        HttpServer server = startServer(200, pathRef, bodyRef, latch);
        try {
            AiSyncClient client = new AiSyncClient("http://localhost:" + server.getAddress().getPort());

            client.dispatch(IntegrationEventType.PRODUCT_UPSERTED_V1, "{\"productId\":\"p-1\"}");

            assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(pathRef.get()).isEqualTo("/api/v1/events/product-upserted");
            assertThat(bodyRef.get()).contains("\"productId\":\"p-1\"");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void dispatch_checkoutCompleted_postsToExpectedEndpoint() throws Exception {
        AtomicReference<String> pathRef = new AtomicReference<>();
        AtomicReference<String> bodyRef = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        HttpServer server = startServer(202, pathRef, bodyRef, latch);
        try {
            AiSyncClient client = new AiSyncClient("http://localhost:" + server.getAddress().getPort());

            client.dispatch(IntegrationEventType.ORDER_CHECKOUT_COMPLETED_V1, "{\"orderId\":\"o-1\"}");

            assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
            assertThat(pathRef.get()).isEqualTo("/api/v1/events/order-checkout-completed");
            assertThat(bodyRef.get()).contains("\"orderId\":\"o-1\"");
        } finally {
            server.stop(0);
        }
    }

    @Test
    void dispatch_throwsWhenAiServiceReturnsNon2xx() throws Exception {
        AiSyncClient client = new AiSyncClient("http://localhost:9999");
        assertThatThrownBy(() -> client.dispatch(IntegrationEventType.PRODUCT_UPSERTED_V1, "{}"))
                .isInstanceOf(IOException.class);
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
