package com.smartmarketplace.service;

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

@Service
public class AiSyncClient {

    private static final Logger log = LoggerFactory.getLogger(AiSyncClient.class);

    private final HttpClient httpClient;
    private final String aiServiceBaseUrl;

    public AiSyncClient(@Value("${ai.service.base-url}") String aiServiceBaseUrl) {
        this.aiServiceBaseUrl = aiServiceBaseUrl;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
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
}
