package com.smartmarketplace.service;

import com.smartmarketplace.dto.CreateOrderRequest;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.exception.BusinessRuleException;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.OrderRepository;
import com.smartmarketplace.repository.ProductRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OrderApplicationServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private ClientRepository clientRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private ProductAvailabilityPolicy productAvailabilityPolicy;

    @InjectMocks
    private OrderApplicationService service;

    @Test
    void createOrder_throwsResourceNotFoundException_whenClientNotFound() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        CreateOrderRequest request = new CreateOrderRequest(
                clientId,
                List.of(new CreateOrderRequest.OrderItemRequest(productId, 2))
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.createOrder(request))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Client");
    }

    @Test
    void createOrder_throwsResourceNotFoundException_whenProductNotFound() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Country country = new Country();
        country.setCode("BR");
        country.setName("Brazil");

        Client client = new Client();
        client.setId(clientId);
        client.setName("Alice");
        client.setSegment("retail");
        client.setCountry(country);

        CreateOrderRequest request = new CreateOrderRequest(
                clientId,
                List.of(new CreateOrderRequest.OrderItemRequest(productId, 1))
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(productRepository.findAllByIdWithCountries(anyList())).thenReturn(Collections.emptyList());

        assertThatThrownBy(() -> service.createOrder(request))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Product");
    }

    @Test
    void createOrder_throwsBusinessRuleException_forDuplicateProductIds() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Country country = new Country();
        country.setCode("BR");
        country.setName("Brazil");

        Client client = new Client();
        client.setId(clientId);
        client.setName("Alice");
        client.setSegment("retail");
        client.setCountry(country);

        CreateOrderRequest request = new CreateOrderRequest(
                clientId,
                List.of(
                        new CreateOrderRequest.OrderItemRequest(productId, 1),
                        new CreateOrderRequest.OrderItemRequest(productId, 2)
                )
        );

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));

        assertThatThrownBy(() -> service.createOrder(request))
                .isInstanceOf(BusinessRuleException.class)
                .hasMessageContaining("Duplicate product IDs");
    }
}
