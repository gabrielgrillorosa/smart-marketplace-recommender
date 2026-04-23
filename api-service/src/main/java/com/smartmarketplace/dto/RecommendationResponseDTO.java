package com.smartmarketplace.dto;

import java.util.List;
import java.util.UUID;

public record RecommendationResponseDTO(
        UUID clientId,
        boolean degraded,
        List<RecommendationItemDTO> items
) {}
