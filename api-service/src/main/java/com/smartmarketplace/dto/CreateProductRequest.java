package com.smartmarketplace.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record CreateProductRequest(
        @NotBlank String sku,
        @NotBlank String name,
        @NotBlank @Size(min = 30) String description,
        @NotBlank String category,
        @NotNull @DecimalMin(value = "0.01") BigDecimal price,
        @NotNull UUID supplierId,
        @NotEmpty List<@NotBlank String> countryCodes
) {}
