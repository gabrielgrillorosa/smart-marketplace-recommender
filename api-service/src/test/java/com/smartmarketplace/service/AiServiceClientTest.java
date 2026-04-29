package com.smartmarketplace.service;

import com.smartmarketplace.dto.RecommendationItemDTO;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.reactive.function.client.ClientResponse;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiServiceClientTest {

    @Test
    void recommend_returnsItemsAndRecordsSuccessMetric() {
        UUID recommendationId = UUID.randomUUID();
        UUID clientId = UUID.randomUUID();
        AtomicReference<String> pathRef = new AtomicReference<>();

        WebClient webClient = WebClient.builder()
                .exchangeFunction(request -> {
                    pathRef.set(request.url().getPath());
                    String json = "[{\"id\":\"" + recommendationId + "\",\"name\":\"Prod A\",\"category\":\"food\","
                            + "\"price\":19.9,\"score\":0.88,\"matchReason\":\"semantic\"}]";
                    return Mono.just(
                            ClientResponse.create(HttpStatus.OK)
                                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                                    .body(json)
                                    .build()
                    );
                })
                .build();

        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        AiServiceClient client = new AiServiceClient(webClient, meterRegistry);

        Optional<List<RecommendationItemDTO>> result = client.recommend(clientId, 5);

        assertThat(pathRef.get()).isEqualTo("/api/v1/recommend");
        assertThat(result).isPresent();
        assertThat(result.orElseThrow()).hasSize(1);
        assertThat(result.orElseThrow().get(0).id()).isEqualTo(recommendationId);

        Timer timer = meterRegistry.find("ai.service.call.duration")
                .tag("outcome", "success")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recommend_rethrowsWhenAiCallFails_andRecordsFallbackMetric() {
        WebClient webClient = WebClient.builder()
                .exchangeFunction(request -> Mono.error(new RuntimeException("ai unavailable")))
                .build();

        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        AiServiceClient client = new AiServiceClient(webClient, meterRegistry);

        assertThatThrownBy(() -> client.recommend(UUID.randomUUID(), 3))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("ai unavailable");

        Timer timer = meterRegistry.find("ai.service.call.duration")
                .tag("outcome", "fallback")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }
}
