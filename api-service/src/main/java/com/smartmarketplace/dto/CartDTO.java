package com.smartmarketplace.dto;

import java.util.List;
import java.util.UUID;

public record CartDTO(
        UUID cartId,
        UUID clientId,
        List<CartItemDTO> items,
        int itemCount
) {}
