package com.smartmarketplace.service;

import com.smartmarketplace.dto.RecommendationItemDTO;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;

@Service
public class AiServiceClient {

    private static final Logger log = LoggerFactory.getLogger(AiServiceClient.class);
    private final WebClient aiWebClient;
    private final MeterRegistry meterRegistry;

    public AiServiceClient(WebClient aiWebClient, MeterRegistry meterRegistry) {
        this.aiWebClient = aiWebClient;
        this.meterRegistry = meterRegistry;
    }

    @CircuitBreaker(name = "aiService", fallbackMethod = "emptyFallback")
    public Optional<List<RecommendationItemDTO>> recommend(UUID clientId, int limit) {
        Timer.Sample sample = Timer.start(meterRegistry);
        try {
            List<RecommendationItemDTO> items = callAiService(clientId, limit);
            sample.stop(Timer.builder("ai.service.call.duration")
                    .description("AI service call duration")
                    .tag("outcome", "success")
                    .register(meterRegistry));
            return Optional.ofNullable(items);
        } catch (RuntimeException ex) {
            sample.stop(Timer.builder("ai.service.call.duration")
                    .description("AI service call duration")
                    .tag("outcome", "fallback")
                    .register(meterRegistry));
            throw ex;
        }
    }

    private List<RecommendationItemDTO> callAiService(UUID clientId, int limit) {
        Map<String, Object> body = Map.of("clientId", clientId.toString(), "limit", limit);
        return aiWebClient.post()
                .uri("/recommend")
                .bodyValue(body)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<List<RecommendationItemDTO>>() {})
                .block();
    }

    @SuppressWarnings("unused")
    private Optional<List<RecommendationItemDTO>> emptyFallback(Throwable t) {
        log.warn("AI service call failed, using fallback: {}", t.getMessage());
        return Optional.empty();
    }
}
