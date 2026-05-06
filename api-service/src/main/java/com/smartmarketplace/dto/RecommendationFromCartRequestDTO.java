package com.smartmarketplace.dto;

import java.util.List;
import java.util.UUID;

public record RecommendationFromCartRequestDTO(
        UUID clientId,
        List<UUID> productIds,
        Integer limit
) {}
