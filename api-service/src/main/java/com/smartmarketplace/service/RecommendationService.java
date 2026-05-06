package com.smartmarketplace.service;

import com.smartmarketplace.dto.RecommendationEnvelopeDTO;
import com.smartmarketplace.dto.RecommendationItemDTO;
import com.smartmarketplace.dto.RecommendationResponseDTO;
import com.smartmarketplace.dto.RecommendationViewItemDTO;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.FallbackRecommendationQuery;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class RecommendationService {

    private final ClientRepository clientRepository;
    private final AiServiceClient aiServiceClient;
    private final FallbackRecommendationQuery fallbackQuery;
    private final MeterRegistry meterRegistry;

    public RecommendationService(ClientRepository clientRepository,
                                 AiServiceClient aiServiceClient,
                                 FallbackRecommendationQuery fallbackQuery,
                                 MeterRegistry meterRegistry) {
        this.clientRepository = clientRepository;
        this.aiServiceClient = aiServiceClient;
        this.fallbackQuery = fallbackQuery;
        this.meterRegistry = meterRegistry;
    }

    public RecommendationEnvelopeDTO recommend(UUID clientId, int limit) {
        Client client = loadClient(clientId);
        return recommendForClient(client, limit);
    }

    public RecommendationEnvelopeDTO recommendFromCart(UUID clientId, List<UUID> productIds, int limit) {
        Client client = loadClient(clientId);
        List<UUID> cartProductIds = productIds == null ? Collections.emptyList() : productIds;

        Timer.Sample sample = Timer.start(meterRegistry);
        Optional<RecommendationEnvelopeDTO> aiResult = aiServiceClient.recommendFromCart(clientId, cartProductIds, limit);
        if (hasRecommendations(aiResult)) {
            stopTimer(sample, false, "from-cart");
            return withFallbackFlag(aiResult.orElseThrow(), false);
        }

        List<RecommendationViewItemDTO> fallbackItems = fallbackQuery.topSellingForCart(
                client.getCountry().getCode().trim(),
                clientId,
                cartProductIds,
                limit
        );
        stopTimer(sample, true, "from-cart");
        return new RecommendationEnvelopeDTO(fallbackItems, true, null);
    }

    public RecommendationResponseDTO recommendLegacy(UUID clientId, int limit) {
        RecommendationEnvelopeDTO response = recommend(clientId, limit);
        List<RecommendationItemDTO> items = response.recommendations().stream()
                .map(item -> new RecommendationItemDTO(
                        item.id(),
                        item.name(),
                        item.category(),
                        item.price(),
                        item.finalScore(),
                        Boolean.TRUE.equals(response.isFallback()) ? "fallback" : item.matchReason()
                ))
                .toList();
        return new RecommendationResponseDTO(clientId, Boolean.TRUE.equals(response.isFallback()), items);
    }

    private RecommendationEnvelopeDTO recommendForClient(Client client, int limit) {
        UUID clientId = client.getId();
        Timer.Sample sample = Timer.start(meterRegistry);
        Optional<RecommendationEnvelopeDTO> aiResult = aiServiceClient.recommend(clientId, limit);
        if (hasRecommendations(aiResult)) {
            stopTimer(sample, false, "default");
            return withFallbackFlag(aiResult.orElseThrow(), false);
        }

        List<RecommendationViewItemDTO> fallbackItems = fallbackQuery.topSelling(client.getCountry().getCode().trim(), clientId, limit);
        stopTimer(sample, true, "default");
        return new RecommendationEnvelopeDTO(fallbackItems, true, null);
    }

    private Client loadClient(UUID clientId) {
        return clientRepository.findByIdWithCountry(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client", clientId));
    }

    private boolean hasRecommendations(Optional<RecommendationEnvelopeDTO> aiResult) {
        return aiResult.isPresent()
                && aiResult.get().recommendations() != null
                && !aiResult.get().recommendations().isEmpty();
    }

    private RecommendationEnvelopeDTO withFallbackFlag(RecommendationEnvelopeDTO response, boolean isFallback) {
        return new RecommendationEnvelopeDTO(response.recommendations(), isFallback, response.rankingConfig());
    }

    private void stopTimer(Timer.Sample sample, boolean degraded, String flow) {
        sample.stop(Timer.builder("recommendation.latency")
                .tag("degraded", Boolean.toString(degraded))
                .tag("flow", flow)
                .register(meterRegistry));
    }
}
