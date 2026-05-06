package com.smartmarketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartmarketplace.dto.RecommendationEnvelopeDTO;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class AiServiceClientTest {

    @Test
    void recommend_returnsItemsAndRecordsSuccessMetric() throws Exception {
        UUID recommendationId = UUID.randomUUID();
        UUID clientId = UUID.randomUUID();
        HttpClient httpClient = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("""
                {
                  "recommendations": [
                    {
                      "id": "%s",
                      "name": "Prod A",
                      "category": "food",
                      "price": 19.9,
                      "sku": "SKU-1",
                      "finalScore": 0.88,
                      "matchReason": "semantic"
                    }
                  ]
                }
                """.formatted(recommendationId));
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenReturn(response);

        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        AiServiceClient client = new AiServiceClient(
                httpClient,
                new ObjectMapper(),
                meterRegistry,
                "http://localhost:3001",
                3000
        );

        Optional<RecommendationEnvelopeDTO> result = client.recommend(clientId, 5);

        assertThat(result).isPresent();
        assertThat(result.orElseThrow().recommendations()).hasSize(1);
        assertThat(result.orElseThrow().recommendations().get(0).id()).isEqualTo(recommendationId);

        Timer timer = meterRegistry.find("ai.service.call.duration")
                .tag("operation", "recommend")
                .tag("outcome", "success")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recommend_rethrowsWhenAiCallFails_andRecordsFallbackMetric() {
        HttpClient httpClient = mock(HttpClient.class);
        try {
            when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                    .thenThrow(new IOException("ai unavailable"));
        } catch (IOException | InterruptedException e) {
            throw new RuntimeException(e);
        }

        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        AiServiceClient client = new AiServiceClient(
                httpClient,
                new ObjectMapper(),
                meterRegistry,
                "http://localhost:3001",
                3000
        );

        assertThatThrownBy(() -> client.recommend(UUID.randomUUID(), 3))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ai unavailable");

        Timer timer = meterRegistry.find("ai.service.call.duration")
                .tag("operation", "recommend")
                .tag("outcome", "fallback")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recommendFromCart_callsFromCartEndpoint() throws Exception {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        HttpClient httpClient = mock(HttpClient.class);
        @SuppressWarnings("unchecked")
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"recommendations\":[]}");
        final HttpRequest[] capturedRequest = new HttpRequest[1];
        when(httpClient.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class))).thenAnswer(invocation -> {
            capturedRequest[0] = invocation.getArgument(0);
            return response;
        });

        AiServiceClient client = new AiServiceClient(
                httpClient,
                new ObjectMapper(),
                new SimpleMeterRegistry(),
                "http://localhost:3001",
                3000
        );
        client.recommendFromCart(clientId, java.util.List.of(productId), 4);

        assertThat(capturedRequest[0].uri().getPath()).isEqualTo("/api/v1/recommend/from-cart");
    }
}
