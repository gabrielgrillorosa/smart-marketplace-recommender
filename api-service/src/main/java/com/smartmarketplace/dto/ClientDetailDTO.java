package com.smartmarketplace.dto;

import java.util.UUID;

public record ClientDetailDTO(
        UUID id,
        String name,
        String segment,
        String countryCode,
        PurchaseSummaryDTO purchaseSummary
) {}
