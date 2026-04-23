package com.smartmarketplace.dto;

import java.util.UUID;

public record ClientSummaryDTO(
        UUID id,
        String name,
        String segment,
        String countryCode
) {}
