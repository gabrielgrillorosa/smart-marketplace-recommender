package com.smartmarketplace.controller;

import com.smartmarketplace.dto.*;
import com.smartmarketplace.exception.BusinessRuleException;
import com.smartmarketplace.service.ClientApplicationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/clients")
@Tag(name = "Clients", description = "Client profile and order history endpoints")
public class ClientController {

    private final ClientApplicationService clientService;

    public ClientController(ClientApplicationService clientService) {
        this.clientService = clientService;
    }

    @GetMapping
    @Operation(summary = "List clients with pagination")
    @ApiResponse(responseCode = "200", description = "Paginated client list")
    @ApiResponse(responseCode = "400", description = "Invalid pagination parameters")
    public ResponseEntity<PagedResponse<ClientSummaryDTO>> listClients(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        validatePagination(page, size);
        return ResponseEntity.ok(clientService.listClients(page, size));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get client detail with purchase summary")
    @ApiResponse(responseCode = "200", description = "Client detail")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<ClientDetailDTO> getClient(@PathVariable UUID id) {
        return ResponseEntity.ok(clientService.getClient(id));
    }

    @GetMapping("/{id}/orders")
    @Operation(summary = "Get client order history sorted by newest first")
    @ApiResponse(responseCode = "200", description = "Paginated order history")
    @ApiResponse(responseCode = "404", description = "Client not found")
    public ResponseEntity<PagedResponse<OrderDTO>> getClientOrders(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        validatePagination(page, size);
        return ResponseEntity.ok(clientService.listClientOrders(id, page, size));
    }

    private void validatePagination(int page, int size) {
        if (page < 0) throw new BusinessRuleException("page must be >= 0");
        if (size < 1 || size > 100) throw new BusinessRuleException("size must be between 1 and 100");
    }
}
