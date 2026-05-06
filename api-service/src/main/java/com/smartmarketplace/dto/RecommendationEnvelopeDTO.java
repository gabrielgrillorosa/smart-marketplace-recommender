package com.smartmarketplace.dto;

import java.util.List;

public record RecommendationEnvelopeDTO(
        List<RecommendationViewItemDTO> recommendations,
        Boolean isFallback,
        RecommendationRankingConfigDTO rankingConfig
) {}
