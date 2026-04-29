package com.smartmarketplace.controller;

import com.smartmarketplace.dto.AddCartItemRequest;
import com.smartmarketplace.dto.CartDTO;
import com.smartmarketplace.dto.CheckoutResponse;
import com.smartmarketplace.service.CartApplicationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/carts")
@Tag(name = "Cart", description = "Cart management endpoints")
public class CartController {

    private final CartApplicationService cartApplicationService;

    public CartController(CartApplicationService cartApplicationService) {
        this.cartApplicationService = cartApplicationService;
    }

    @GetMapping("/{clientId}")
    @Operation(summary = "Get active cart for a client")
    @ApiResponse(responseCode = "200", description = "Cart found or empty contract")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<CartDTO> getCart(@PathVariable UUID clientId) {
        return ResponseEntity.ok(cartApplicationService.getActiveCart(clientId));
    }

    @PostMapping("/{clientId}/items")
    @Operation(summary = "Add item to cart")
    @ApiResponse(responseCode = "200", description = "Cart updated")
    @ApiResponse(responseCode = "400", description = "Validation error")
    @ApiResponse(responseCode = "404", description = "Client or product not found")
    public ResponseEntity<CartDTO> addItem(@PathVariable UUID clientId,
                                           @Valid @RequestBody AddCartItemRequest request) {
        return ResponseEntity.ok(cartApplicationService.addItem(clientId, request));
    }

    @DeleteMapping("/{clientId}/items/{productId}")
    @Operation(summary = "Remove one product from cart")
    @ApiResponse(responseCode = "200", description = "Cart updated")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<CartDTO> removeItem(@PathVariable UUID clientId, @PathVariable UUID productId) {
        return ResponseEntity.ok(cartApplicationService.removeItem(clientId, productId));
    }

    @DeleteMapping("/{clientId}")
    @Operation(summary = "Clear active cart")
    @ApiResponse(responseCode = "200", description = "Cart cleared")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<CartDTO> clearCart(@PathVariable UUID clientId) {
        return ResponseEntity.ok(cartApplicationService.clearCart(clientId));
    }

    @PostMapping("/{clientId}/checkout")
    @Operation(summary = "Checkout active cart and create a real order")
    @ApiResponse(responseCode = "201", description = "Checkout completed")
    @ApiResponse(responseCode = "404", description = "Client not found")
    @ApiResponse(responseCode = "422", description = "Cart is empty")
    public ResponseEntity<CheckoutResponse> checkout(@PathVariable UUID clientId) {
        return ResponseEntity.status(201).body(cartApplicationService.checkout(clientId));
    }
}
