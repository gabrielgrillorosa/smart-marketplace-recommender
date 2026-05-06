package com.smartmarketplace.service;

import com.smartmarketplace.outbox.IntegrationEventType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

@Service
public class AiSyncClient {

    private final HttpClient httpClient;
    private final String aiServiceBaseUrl;

    public AiSyncClient(@Value("${ai.service.base-url}") String aiServiceBaseUrl) {
        this.aiServiceBaseUrl = aiServiceBaseUrl;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }

    public void dispatch(IntegrationEventType eventType, String payload) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(aiServiceBaseUrl + pathFor(eventType)))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .timeout(Duration.ofSeconds(10))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IllegalStateException(
                    "ai-service returned " + response.statusCode() + " for " + eventType
            );
        }
    }

    private String pathFor(IntegrationEventType eventType) {
        return switch (eventType) {
            case PRODUCT_UPSERTED_V1 -> "/api/v1/events/product-upserted";
            case ORDER_CHECKOUT_COMPLETED_V1 -> "/api/v1/events/order-checkout-completed";
        };
    }
}
