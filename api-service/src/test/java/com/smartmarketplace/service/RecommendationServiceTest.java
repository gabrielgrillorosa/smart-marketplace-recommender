package com.smartmarketplace.service;

import com.smartmarketplace.dto.RecommendationItemDTO;
import com.smartmarketplace.dto.RecommendationResponseDTO;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.FallbackRecommendationQuery;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class RecommendationServiceTest {

    @Mock
    private ClientRepository clientRepository;

    @Mock
    private AiServiceClient aiServiceClient;

    @Mock
    private FallbackRecommendationQuery fallbackQuery;

    private final MeterRegistry meterRegistry = new SimpleMeterRegistry();

    private RecommendationService service;

    @BeforeEach
    void setUp() {
        service = new RecommendationService(clientRepository, aiServiceClient, fallbackQuery, meterRegistry);
    }

    private Client buildClient(UUID id, String countryCode) {
        Country country = new Country();
        country.setCode(countryCode);
        country.setName("Brazil");

        Client client = new Client();
        client.setId(id);
        client.setName("Alice");
        client.setSegment("retail");
        client.setCountry(country);
        return client;
    }

    @Test
    void recommend_returnsAiResults_whenAvailable() {
        UUID clientId = UUID.randomUUID();
        Client client = buildClient(clientId, "BR");

        RecommendationItemDTO item = new RecommendationItemDTO(
                UUID.randomUUID(), "Coffee", "beverages",
                new BigDecimal("9.90"), 0.95, "ai-match"
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(aiServiceClient.recommend(any(UUID.class), anyInt())).thenReturn(Optional.of(List.of(item)));

        RecommendationResponseDTO response = service.recommend(clientId, 5);

        assertThat(response.degraded()).isFalse();
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).matchReason()).isEqualTo("ai-match");
        assertThat(response.clientId()).isEqualTo(clientId);
    }

    @Test
    void recommend_fallsBackToFallback_whenAiReturnsEmpty() {
        UUID clientId = UUID.randomUUID();
        Client client = buildClient(clientId, "BR");

        RecommendationItemDTO fallbackItem = new RecommendationItemDTO(
                UUID.randomUUID(), "Tea", "beverages",
                new BigDecimal("4.50"), null, "fallback"
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(aiServiceClient.recommend(any(UUID.class), anyInt())).thenReturn(Optional.of(Collections.emptyList()));
        when(fallbackQuery.topSelling(anyString(), any(UUID.class), anyInt())).thenReturn(List.of(fallbackItem));

        RecommendationResponseDTO response = service.recommend(clientId, 5);

        assertThat(response.degraded()).isTrue();
        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).matchReason()).isEqualTo("fallback");
    }

    @Test
    void recommend_fallsBackToFallback_whenAiReturnsEmptyOptional() {
        UUID clientId = UUID.randomUUID();
        Client client = buildClient(clientId, "BR");

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(aiServiceClient.recommend(any(UUID.class), anyInt())).thenReturn(Optional.empty());
        when(fallbackQuery.topSelling(anyString(), any(UUID.class), anyInt())).thenReturn(Collections.emptyList());

        RecommendationResponseDTO response = service.recommend(clientId, 5);

        assertThat(response.degraded()).isTrue();
        assertThat(response.items()).isEmpty();
    }

    @Test
    void recommend_throwsResourceNotFoundException_whenClientNotFound() {
        UUID clientId = UUID.randomUUID();
        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.recommend(clientId, 5))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Client");
    }
}
