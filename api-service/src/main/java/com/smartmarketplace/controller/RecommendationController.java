package com.smartmarketplace.controller;

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

        if (limit < 1 || limit > 50) {
            throw new BusinessRuleException("limit must be between 1 and 50");
        }
        return ResponseEntity.ok(recommendationService.recommend(clientId, limit));
    }
}
