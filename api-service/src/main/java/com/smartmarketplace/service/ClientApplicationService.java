package com.smartmarketplace.service;

import com.smartmarketplace.dto.*;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Order;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.OrderRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Service
@Transactional(readOnly = true)
public class ClientApplicationService {

    private final ClientRepository clientRepository;
    private final OrderRepository orderRepository;

    public ClientApplicationService(ClientRepository clientRepository,
                                    OrderRepository orderRepository) {
        this.clientRepository = clientRepository;
        this.orderRepository = orderRepository;
    }

    public PagedResponse<ClientSummaryDTO> listClients(int page, int size) {
        Page<Client> result = clientRepository.findAll(PageRequest.of(page, size));
        List<ClientSummaryDTO> items = result.getContent().stream()
                .map(c -> new ClientSummaryDTO(c.getId(), c.getName(), c.getSegment(),
                        c.getCountry().getCode().trim()))
                .toList();
        return new PagedResponse<>(items, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    public ClientDetailDTO getClient(UUID id) {
        Client client = clientRepository.findByIdWithCountry(id)
                .orElseThrow(() -> new ResourceNotFoundException("Client", id));

        PurchaseSummaryDTO summary = orderRepository.findPurchaseSummaryByClientId(id);
        if (summary == null) {
            summary = new PurchaseSummaryDTO(0, 0, BigDecimal.ZERO, null);
        }

        return new ClientDetailDTO(
                client.getId(), client.getName(), client.getSegment(),
                client.getCountry().getCode().trim(), summary
        );
    }

    public PagedResponse<OrderDTO> listClientOrders(UUID clientId, int page, int size) {
        if (!clientRepository.existsById(clientId)) {
            throw new ResourceNotFoundException("Client", clientId);
        }

        Page<Order> result = orderRepository.findByClientIdOrderByOrderDateDesc(clientId,
                PageRequest.of(page, size));

        List<OrderDTO> items = result.getContent().stream()
                .map(this::toOrderDTO)
                .toList();

        return new PagedResponse<>(items, result.getNumber(), result.getSize(),
                result.getTotalElements(), result.getTotalPages());
    }

    private OrderDTO toOrderDTO(Order o) {
        List<OrderItemDTO> orderItems = o.getItems().stream()
                .map(i -> new OrderItemDTO(
                        i.getProduct().getId(), i.getProduct().getName(),
                        i.getQuantity(), i.getUnitPrice()))
                .toList();
        return new OrderDTO(o.getId(), o.getOrderDate(), o.getTotal(), orderItems);
    }
}
