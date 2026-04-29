package com.smartmarketplace.service;

import com.smartmarketplace.dto.CreateOrderRequest;
import com.smartmarketplace.dto.OrderDTO;
import com.smartmarketplace.dto.OrderItemDTO;
import com.smartmarketplace.entity.*;
import com.smartmarketplace.exception.BusinessRuleException;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.ProductRepository;
import com.smartmarketplace.repository.OrderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class OrderApplicationService {

    private final OrderRepository orderRepository;
    private final ClientRepository clientRepository;
    private final ProductRepository productRepository;
    private final ProductAvailabilityPolicy productAvailabilityPolicy;

    public OrderApplicationService(OrderRepository orderRepository,
                                   ClientRepository clientRepository,
                                   ProductRepository productRepository,
                                   ProductAvailabilityPolicy productAvailabilityPolicy) {
        this.orderRepository = orderRepository;
        this.clientRepository = clientRepository;
        this.productRepository = productRepository;
        this.productAvailabilityPolicy = productAvailabilityPolicy;
    }

    @Transactional
    public OrderDTO createOrder(CreateOrderRequest request) {
        Client client = clientRepository.findByIdWithCountry(request.clientId())
                .orElseThrow(() -> new ResourceNotFoundException("Client", request.clientId()));

        List<UUID> productIds = request.items().stream()
                .map(CreateOrderRequest.OrderItemRequest::productId)
                .toList();

        long distinctCount = productIds.stream().distinct().count();
        if (distinctCount != productIds.size()) {
            throw new BusinessRuleException("Duplicate product IDs in order request");
        }

        List<Product> products = productRepository.findAllByIdWithCountries(productIds);
        if (products.size() != productIds.size()) {
            Set<UUID> found = products.stream().map(Product::getId).collect(Collectors.toSet());
            List<UUID> unknown = productIds.stream().filter(id -> !found.contains(id)).toList();
            throw new ResourceNotFoundException("Product", unknown);
        }

        Map<UUID, Product> productMap = products.stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        productAvailabilityPolicy.assertAllAvailableForClientCountry(client, products);

        Order order = new Order();
        order.setClient(client);
        BigDecimal total = BigDecimal.ZERO;

        for (CreateOrderRequest.OrderItemRequest itemReq : request.items()) {
            Product product = productMap.get(itemReq.productId());
            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProduct(product);
            item.setQuantity(itemReq.quantity());
            item.setUnitPrice(product.getPrice());
            order.getItems().add(item);
            total = total.add(product.getPrice().multiply(BigDecimal.valueOf(itemReq.quantity())));
        }

        order.setTotal(total);
        order = orderRepository.save(order);

        List<OrderItemDTO> itemDTOs = order.getItems().stream()
                .map(i -> new OrderItemDTO(
                        i.getProduct().getId(), i.getProduct().getName(),
                        i.getQuantity(), i.getUnitPrice()))
                .toList();

        return new OrderDTO(order.getId(), order.getOrderDate(), order.getTotal(), itemDTOs);
    }
}
