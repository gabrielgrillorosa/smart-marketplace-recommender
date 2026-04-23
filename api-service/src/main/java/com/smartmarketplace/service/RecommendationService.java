package com.smartmarketplace.service;

import com.smartmarketplace.dto.RecommendationItemDTO;
import com.smartmarketplace.dto.RecommendationResponseDTO;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.FallbackRecommendationQuery;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

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

    public RecommendationResponseDTO recommend(UUID clientId, int limit) {
        Timer.Sample sample = Timer.start(meterRegistry);

        Client client = clientRepository.findByIdWithCountry(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client", clientId));

        String countryCode = client.getCountry().getCode().trim();

        Optional<List<RecommendationItemDTO>> aiResult = aiServiceClient.recommend(clientId, limit);

        if (aiResult.isPresent() && !aiResult.get().isEmpty()) {
            sample.stop(Timer.builder("recommendation.latency")
                    .tag("degraded", "false")
                    .register(meterRegistry));
            return new RecommendationResponseDTO(clientId, false, aiResult.get());
        }

        List<RecommendationItemDTO> fallbackItems = fallbackQuery.topSelling(countryCode, clientId, limit);
        sample.stop(Timer.builder("recommendation.latency")
                .tag("degraded", "true")
                .register(meterRegistry));
        return new RecommendationResponseDTO(clientId, true, fallbackItems);
    }
}
