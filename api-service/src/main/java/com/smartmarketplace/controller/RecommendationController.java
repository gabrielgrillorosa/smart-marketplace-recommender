package com.smartmarketplace.controller;

import com.smartmarketplace.dto.RecommendationEnvelopeDTO;
import com.smartmarketplace.dto.RecommendationFromCartRequestDTO;
import com.smartmarketplace.dto.RecommendationRequestDTO;
import com.smartmarketplace.dto.RecommendationResponseDTO;
import com.smartmarketplace.exception.BusinessRuleException;
import com.smartmarketplace.service.RecommendationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/recommend")
@Tag(name = "Recommendations", description = "AI-powered product recommendation proxy")
public class RecommendationController {

    private final RecommendationService recommendationService;

    public RecommendationController(RecommendationService recommendationService) {
        this.recommendationService = recommendationService;
    }

    @GetMapping("/{clientId}")
    @Operation(summary = "Get product recommendations for a client")
    @ApiResponse(responseCode = "200", description = "Recommendation list (possibly degraded)")
    @ApiResponse(responseCode = "400", description = "Invalid limit parameter")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<RecommendationResponseDTO> recommend(
            @PathVariable UUID clientId,
            @RequestParam(defaultValue = "10") int limit) {

        validateLimit(limit);
        return ResponseEntity.ok(recommendationService.recommendLegacy(clientId, limit));
    }

    @PostMapping
    @Operation(summary = "Get product recommendations for a client via AI facade")
    @ApiResponse(responseCode = "200", description = "Recommendation list with optional fallback")
    @ApiResponse(responseCode = "400", description = "Invalid request")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<RecommendationEnvelopeDTO> recommendPost(@RequestBody RecommendationRequestDTO request) {
        if (request.clientId() == null) {
            throw new BusinessRuleException("clientId is required");
        }
        int limit = request.limit() == null ? 10 : request.limit();
        validateLimit(limit);
        return ResponseEntity.ok(recommendationService.recommend(request.clientId(), limit));
    }

    @PostMapping("/from-cart")
    @Operation(summary = "Get product recommendations for a client using cart context via AI facade")
    @ApiResponse(responseCode = "200", description = "Recommendation list with optional fallback")
    @ApiResponse(responseCode = "400", description = "Invalid request")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<RecommendationEnvelopeDTO> recommendFromCart(
            @RequestBody RecommendationFromCartRequestDTO request
    ) {
        if (request.clientId() == null) {
            throw new BusinessRuleException("clientId is required");
        }
        int limit = request.limit() == null ? 10 : request.limit();
        validateLimit(limit);
        return ResponseEntity.ok(recommendationService.recommendFromCart(
                request.clientId(),
                request.productIds() == null ? java.util.List.of() : request.productIds(),
                limit
        ));
    }

    private void validateLimit(int limit) {
        if (limit < 1 || limit > 50) {
            throw new BusinessRuleException("limit must be between 1 and 50");
        }
    }
}
