package com.smartmarketplace.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record OrderDTO(
        UUID id,
        LocalDateTime orderDate,
        BigDecimal total,
        List<OrderItemDTO> items
) {}
