package com.smartmarketplace.dto;

import java.util.UUID;

public record CartItemDTO(
        UUID productId,
        int quantity
) {}
