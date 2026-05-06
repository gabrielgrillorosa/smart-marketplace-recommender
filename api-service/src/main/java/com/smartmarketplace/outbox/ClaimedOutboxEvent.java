package com.smartmarketplace.outbox;

import java.util.UUID;

public record ClaimedOutboxEvent(
        UUID id,
        IntegrationEventType eventType,
        String payload
) {
}
