package com.smartmarketplace.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record RecommendationViewItemDTO(
        UUID id,
        String name,
        String category,
        BigDecimal price,
        String sku,
        Double finalScore,
        Double neuralScore,
        Double semanticScore,
        String matchReason,
        Double recencySimilarity,
        Double rankScore,
        Double hybridNeuralTerm,
        Double hybridSemanticTerm,
        Double recencyBoostTerm,
        Boolean eligible,
        String eligibilityReason,
        String suppressionUntil,
        String lastPurchaseAt
) {}
