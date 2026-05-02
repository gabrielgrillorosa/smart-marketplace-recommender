package com.smartmarketplace.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartmarketplace.dto.ProductDetailDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class AiSyncClient {

    private static final Logger log = LoggerFactory.getLogger(AiSyncClient.class);

    private final HttpClient httpClient;
    private final String aiServiceBaseUrl;
    private final ObjectMapper objectMapper;

    public AiSyncClient(@Value("${ai.service.base-url}") String aiServiceBaseUrl) {
        this.aiServiceBaseUrl = aiServiceBaseUrl;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    public void notifyProductCreated(ProductDetailDTO product) {
        String payload = buildPayload(product);
        Runnable runnable = () -> {
            try {
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(aiServiceBaseUrl + "/api/v1/embeddings/sync-product"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(payload))
                        .timeout(Duration.ofSeconds(10))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

                if (response.statusCode() >= 200 && response.statusCode() < 300) {
                    log.debug("[AiSyncClient] Product {} synced to ai-service (status {})",
                            product.id(), response.statusCode());
                } else {
                    log.warn("[AiSyncClient] ai-service returned {} for product {}",
                            response.statusCode(), product.id());
                }
            } catch (Exception e) {
                log.warn("[AiSyncClient] Failed to notify ai-service for product {}: {}",
                        product.id(), e.getMessage());
            }
        };

        Thread.ofVirtual()
                .name("ai-sync-" + product.id())
                .start(runnable);
    }

    public void notifyCheckoutCompleted(UUID orderId, UUID clientId, List<UUID> productIds, LocalDateTime orderDate) {
        Objects.requireNonNull(orderDate, "orderDate");
        String orderDateIso = DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(orderDate);
        CheckoutSyncRequest payload = new CheckoutSyncRequest(clientId, productIds, orderDateIso);

        Runnable runnable = () -> {
            try {
                String jsonBody = objectMapper.writeValueAsString(payload);
                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(aiServiceBaseUrl + "/api/v1/orders/" + orderId + "/sync-and-train"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                        .timeout(Duration.ofSeconds(10))
                        .build();

                HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() < 200 || response.statusCode() >= 300) {
                    log.warn("[AiSyncClient] checkout sync-and-train returned {} for order {}",
                            response.statusCode(), orderId);
                }
            } catch (JsonProcessingException e) {
                log.warn("[AiSyncClient] Failed to serialize checkout payload for order {}: {}",
                        orderId, e.getMessage());
            } catch (Exception e) {
                log.warn("[AiSyncClient] Failed to notify checkout completion for order {}: {}",
                        orderId, e.getMessage());
            }
        };

        Thread.ofVirtual()
                .name("ai-sync-checkout-" + orderId)
                .start(runnable);
    }

    String buildPayload(ProductDetailDTO product) {
        String countryCodes = product.availableCountries().stream()
                .map(c -> "\"" + c + "\"")
                .reduce((a, b) -> a + "," + b)
                .orElse("");

        return String.format(
                "{\"id\":\"%s\",\"name\":\"%s\",\"description\":\"%s\",\"category\":\"%s\"," +
                "\"price\":%s,\"sku\":\"%s\",\"countryCodes\":[%s]}",
                product.id(),
                escapeJson(product.name()),
                escapeJson(product.description() != null ? product.description() : ""),
                escapeJson(product.category()),
                product.price().toPlainString(),
                escapeJson(product.sku()),
                countryCodes
        );
    }

    private String escapeJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private record CheckoutSyncRequest(UUID clientId, List<UUID> productIds, String orderDate) {}
}
