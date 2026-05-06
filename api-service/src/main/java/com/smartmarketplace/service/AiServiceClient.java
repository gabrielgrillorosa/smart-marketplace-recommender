package com.smartmarketplace.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartmarketplace.dto.RecommendationEnvelopeDTO;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String aiServiceBaseUrl;
    private final Duration requestTimeout;
    private final MeterRegistry meterRegistry;

    public AiServiceClient(
            HttpClient aiServiceHttpClient,
            ObjectMapper objectMapper,
            MeterRegistry meterRegistry,
            @Value("${ai.service.base-url}") String aiServiceBaseUrl,
            @Value("${ai.service.timeout.response}") int responseTimeout
    ) {
        this.httpClient = aiServiceHttpClient;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        this.aiServiceBaseUrl = aiServiceBaseUrl;
        this.requestTimeout = Duration.ofMillis(responseTimeout);
    }

    @CircuitBreaker(name = "aiServiceRecommend", fallbackMethod = "emptyRecommendFallback")
    public Optional<RecommendationEnvelopeDTO> recommend(UUID clientId, int limit) {
        return call("/api/v1/recommend", Map.of("clientId", clientId.toString(), "limit", limit), "recommend");
    }

    @CircuitBreaker(name = "aiServiceRecommendFromCart", fallbackMethod = "emptyRecommendFromCartFallback")
    public Optional<RecommendationEnvelopeDTO> recommendFromCart(UUID clientId, List<UUID> productIds, int limit) {
        List<String> serializedProductIds = productIds.stream()
                .map(UUID::toString)
                .toList();
        return call(
                "/api/v1/recommend/from-cart",
                Map.of("clientId", clientId.toString(), "productIds", serializedProductIds, "limit", limit),
                "recommendFromCart"
        );
    }

    private Optional<RecommendationEnvelopeDTO> call(String uri, Map<String, Object> body, String operation) {
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            String serializedBody = objectMapper.writeValueAsString(body);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(aiServiceBaseUrl + uri))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(serializedBody))
                    .timeout(requestTimeout)
                    .build();
            HttpResponse<String> httpResponse = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (httpResponse.statusCode() < 200 || httpResponse.statusCode() >= 300) {
                throw new IllegalStateException("ai-service returned " + httpResponse.statusCode() + " for " + uri);
            }
            RecommendationEnvelopeDTO response = objectMapper.readValue(httpResponse.body(), RecommendationEnvelopeDTO.class);
            sample.stop(Timer.builder("ai.service.call.duration")
                    .description("AI service call duration")
                    .tag("operation", operation)
                    .tag("outcome", "success")
                    .register(meterRegistry));
            return Optional.ofNullable(response);
        } catch (JsonProcessingException ex) {
            stopFailureTimer(sample, operation);
            throw new IllegalStateException(
                    "Failed to serialize or parse ai-service payload for " + operation + ": " + ex.getMessage(),
                    ex
            );
        } catch (IOException ex) {
            stopFailureTimer(sample, operation);
            throw new IllegalStateException("I/O failure calling ai-service for " + operation + ": " + ex.getMessage(), ex);
        } catch (InterruptedException ex) {
            stopFailureTimer(sample, operation);
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while calling ai-service for " + operation + ": " + ex.getMessage(), ex);
        } catch (RuntimeException ex) {
            stopFailureTimer(sample, operation);
            throw ex;
        } catch (Exception ex) {
            stopFailureTimer(sample, operation);
            throw ex;
        }
    }

    private void stopFailureTimer(Timer.Sample sample, String operation) {
        sample.stop(Timer.builder("ai.service.call.duration")
                .description("AI service call duration")
                .tag("operation", operation)
                .tag("outcome", "fallback")
                .register(meterRegistry));
    }

    @SuppressWarnings("unused")
    private Optional<RecommendationEnvelopeDTO> emptyRecommendFallback(UUID clientId, int limit, Throwable t) {
        log.warn("AI recommend call failed, using fallback for client {}: {}", clientId, t.getMessage());
        return Optional.empty();
    }

    @SuppressWarnings("unused")
    private Optional<RecommendationEnvelopeDTO> emptyRecommendFromCartFallback(
            UUID clientId,
            List<UUID> productIds,
            int limit,
            Throwable t
    ) {
        log.warn(
                "AI recommend/from-cart call failed, using fallback for client {} with {} cart items: {}",
                clientId,
                productIds.size(),
                t.getMessage()
        );
        return Optional.empty();
    }
}
