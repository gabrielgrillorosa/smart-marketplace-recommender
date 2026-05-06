package com.smartmarketplace.dto;

public record RecommendationRankingConfigDTO(
        Double neuralWeight,
        Double semanticWeight,
        Double recencyRerankWeight,
        String profilePoolingMode,
        Double profilePoolingHalfLifeDays
) {}
