package com.smartmarketplace.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record ProductDetailDTO(
        UUID id,
        String sku,
        String name,
        String category,
        BigDecimal price,
        String supplierName,
        List<String> availableCountries,
        String description,
        UUID supplierId,
        LocalDateTime createdAt
) {}
