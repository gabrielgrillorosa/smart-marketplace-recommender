package com.smartmarketplace.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record ProductSummaryDTO(
        UUID id,
        String sku,
        String name,
        String category,
        BigDecimal price,
        String supplierName,
        List<String> availableCountries
) {}
