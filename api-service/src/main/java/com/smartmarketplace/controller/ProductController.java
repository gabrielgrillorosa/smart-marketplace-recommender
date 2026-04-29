package com.smartmarketplace.controller;

import com.smartmarketplace.dto.*;
import com.smartmarketplace.exception.BusinessRuleException;
import com.smartmarketplace.service.ProductApplicationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/products")
@Tag(name = "Products", description = "Product catalog endpoints")
public class ProductController {

    private final ProductApplicationService productService;

    public ProductController(ProductApplicationService productService) {
        this.productService = productService;
    }

    @GetMapping
    @Operation(summary = "List products with optional filters and pagination")
    @ApiResponse(responseCode = "200", description = "Paginated product list")
    @ApiResponse(responseCode = "400", description = "Invalid pagination parameters")
    public ResponseEntity<PagedResponse<ProductSummaryDTO>> listProducts(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String country,
            @RequestParam(required = false) String supplier,
            @RequestParam(required = false) String search,
            @RequestHeader(value = HttpHeaders.CACHE_CONTROL, required = false) String cacheControl) {

        validatePagination(page, size);
        boolean noCache = isCacheBypass(cacheControl);
        return ResponseEntity.ok(
                productService.listProducts(page, size, category, country, supplier, search, noCache));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get product detail by ID")
    @ApiResponse(responseCode = "200", description = "Product detail")
    @ApiResponse(responseCode = "404", description = "Product not found")
    public ResponseEntity<ProductDetailDTO> getProduct(@PathVariable UUID id) {
        return ResponseEntity.ok(productService.getProduct(id));
    }

    @PostMapping
    @Operation(summary = "Create a new product")
    @ApiResponse(responseCode = "201", description = "Product created")
    @ApiResponse(responseCode = "400", description = "Validation error")
    @ApiResponse(responseCode = "409", description = "Duplicate SKU")
    public ResponseEntity<ProductDetailDTO> createProduct(@Valid @RequestBody CreateProductRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(productService.createProduct(request));
    }

    private void validatePagination(int page, int size) {
        if (page < 0) throw new BusinessRuleException("page must be >= 0");
        if (size < 1 || size > 100) throw new BusinessRuleException("size must be between 1 and 100");
    }

    /**
     * Returns true when the request asks the server to bypass any internal cache.
     * Honors HTTP semantics: both {@code no-cache} (RFC 7234 §5.2.1.4) and
     * {@code no-store} (§5.2.1.5) trigger a fresh read. Matching is case-insensitive
     * and tolerant of multiple directives separated by commas, e.g.
     * {@code Cache-Control: no-cache, max-age=0}.
     */
    private boolean isCacheBypass(String cacheControl) {
        if (cacheControl == null || cacheControl.isBlank()) return false;
        String normalized = cacheControl.toLowerCase();
        for (String directive : normalized.split(",")) {
            String trimmed = directive.trim();
            if (trimmed.equals("no-cache") || trimmed.equals("no-store")) return true;
        }
        return false;
    }
}
