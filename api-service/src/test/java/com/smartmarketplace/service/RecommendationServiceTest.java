package com.smartmarketplace.service;

import com.smartmarketplace.dto.RecommendationEnvelopeDTO;
import com.smartmarketplace.dto.RecommendationViewItemDTO;
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

        RecommendationViewItemDTO item = new RecommendationViewItemDTO(
                UUID.randomUUID(), "Coffee", "beverages",
                new BigDecimal("9.90"), "SKU-1", 0.95, 0.80, 0.75,
                "semantic", null, null, null, null, null, true,
                "eligible", null, null
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(aiServiceClient.recommend(any(UUID.class), anyInt()))
                .thenReturn(Optional.of(new RecommendationEnvelopeDTO(List.of(item), null, null)));

        RecommendationEnvelopeDTO response = service.recommend(clientId, 5);

        assertThat(response.isFallback()).isFalse();
        assertThat(response.recommendations()).hasSize(1);
        assertThat(response.recommendations().get(0).matchReason()).isEqualTo("semantic");
    }

    @Test
    void recommend_fallsBackToFallback_whenAiReturnsEmpty() {
        UUID clientId = UUID.randomUUID();
        Client client = buildClient(clientId, "BR");

        RecommendationViewItemDTO fallbackItem = new RecommendationViewItemDTO(
                UUID.randomUUID(), "Tea", "beverages",
                new BigDecimal("4.50"), "SKU-2", null, null, null,
                null, null, null, null, null, null, true,
                "fallback", null, null
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(aiServiceClient.recommend(any(UUID.class), anyInt()))
                .thenReturn(Optional.of(new RecommendationEnvelopeDTO(Collections.emptyList(), null, null)));
        when(fallbackQuery.topSelling(anyString(), any(UUID.class), anyInt())).thenReturn(List.of(fallbackItem));

        RecommendationEnvelopeDTO response = service.recommend(clientId, 5);

        assertThat(response.isFallback()).isTrue();
        assertThat(response.recommendations()).hasSize(1);
        assertThat(response.recommendations().get(0).eligibilityReason()).isEqualTo("fallback");
    }

    @Test
    void recommend_fallsBackToFallback_whenAiReturnsEmptyOptional() {
        UUID clientId = UUID.randomUUID();
        Client client = buildClient(clientId, "BR");

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(aiServiceClient.recommend(any(UUID.class), anyInt())).thenReturn(Optional.empty());
        when(fallbackQuery.topSelling(anyString(), any(UUID.class), anyInt())).thenReturn(Collections.emptyList());

        RecommendationEnvelopeDTO response = service.recommend(clientId, 5);

        assertThat(response.isFallback()).isTrue();
        assertThat(response.recommendations()).isEmpty();
    }

    @Test
    void recommendFromCart_fallsBackToCartAwareFallback_whenAiReturnsEmpty() {
        UUID clientId = UUID.randomUUID();
        UUID cartProductId = UUID.randomUUID();
        Client client = buildClient(clientId, "BR");

        RecommendationViewItemDTO fallbackItem = new RecommendationViewItemDTO(
                UUID.randomUUID(), "Biscuits", "snacks",
                new BigDecimal("7.50"), "SKU-3", null, null, null,
                null, null, null, null, null, null, true,
                "fallback", null, null
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(aiServiceClient.recommendFromCart(any(UUID.class), any(), anyInt())).thenReturn(Optional.empty());
        when(fallbackQuery.topSellingForCart(anyString(), any(UUID.class), any(), anyInt()))
                .thenReturn(List.of(fallbackItem));

        RecommendationEnvelopeDTO response = service.recommendFromCart(clientId, List.of(cartProductId), 5);

        assertThat(response.isFallback()).isTrue();
        assertThat(response.recommendations()).containsExactly(fallbackItem);
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
