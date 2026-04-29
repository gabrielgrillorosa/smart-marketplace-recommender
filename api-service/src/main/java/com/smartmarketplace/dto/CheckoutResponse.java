package com.smartmarketplace.dto;

import java.util.UUID;

public record CheckoutResponse(
        UUID orderId,
        boolean expectedTrainingTriggered
) {}
