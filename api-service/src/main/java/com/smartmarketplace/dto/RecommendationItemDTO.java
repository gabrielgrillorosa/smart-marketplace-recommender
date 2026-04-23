package com.smartmarketplace.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record RecommendationItemDTO(
        UUID id,
        String name,
        String category,
        BigDecimal price,
        Double score,
        String matchReason
) {}
