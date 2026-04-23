package com.smartmarketplace.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PurchaseSummaryDTO(
        long totalOrders,
        long totalItems,
        BigDecimal totalSpent,
        LocalDateTime lastOrderAt
) {}
