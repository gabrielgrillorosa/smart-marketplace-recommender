package com.smartmarketplace.dto;

import java.util.UUID;

public record RecommendationRequestDTO(
        UUID clientId,
        Integer limit
) {}
