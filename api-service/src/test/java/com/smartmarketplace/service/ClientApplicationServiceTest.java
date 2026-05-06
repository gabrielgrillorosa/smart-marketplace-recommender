package com.smartmarketplace.service;

import com.smartmarketplace.dto.ClientDetailDTO;
import com.smartmarketplace.dto.ClientSummaryDTO;
import com.smartmarketplace.dto.PagedResponse;
import com.smartmarketplace.dto.OrderDTO;
import com.smartmarketplace.dto.PurchaseSummaryDTO;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Order;
import com.smartmarketplace.entity.OrderItem;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClientApplicationServiceTest {

    @Mock
    private ClientRepository clientRepository;

    @Mock
    private OrderRepository orderRepository;

    @InjectMocks
    private ClientApplicationService service;

    @Test
    void listClients_returnsPagedResponse() {
        Country country = new Country();
        country.setCode("BR");
        country.setName("Brazil");

        Client client = new Client();
        client.setId(UUID.randomUUID());
        client.setName("Alice");
        client.setSegment("retail");
        client.setCountry(country);

        Page<ClientSummaryDTO> page = new PageImpl<>(
                List.of(new ClientSummaryDTO(client.getId(), client.getName(), client.getSegment(), "BR")),
                PageRequest.of(0, 20),
                1
        );
        when(clientRepository.findAllSummaries(any(Pageable.class))).thenReturn(page);

        PagedResponse<ClientSummaryDTO> response = service.listClients(0, 20);

        assertThat(response.items()).hasSize(1);
        assertThat(response.totalItems()).isEqualTo(1);
        assertThat(response.items().get(0).name()).isEqualTo("Alice");
        assertThat(response.items().get(0).countryCode()).isEqualTo("BR");
    }

    @Test
    void getClient_throwsResourceNotFoundException_whenNotFound() {
        UUID id = UUID.randomUUID();
        when(clientRepository.findByIdWithCountry(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getClient(id))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Client")
                .hasMessageContaining(id.toString());
    }

    @Test
    void getClient_returnsDetailWithSummary_whenFound() {
        UUID id = UUID.randomUUID();
        Country country = new Country();
        country.setCode("BR");
        country.setName("Brazil");

        Client client = new Client();
        client.setId(id);
        client.setName("Bob");
        client.setSegment("wholesale");
        client.setCountry(country);

        when(clientRepository.findByIdWithCountry(id)).thenReturn(Optional.of(client));
        when(orderRepository.findPurchaseSummaryByClientId(id))
                .thenReturn(new PurchaseSummaryDTO(2, 5, new BigDecimal("100.00"), null));

        ClientDetailDTO detail = service.getClient(id);

        assertThat(detail.id()).isEqualTo(id);
        assertThat(detail.name()).isEqualTo("Bob");
        assertThat(detail.purchaseSummary().totalOrders()).isEqualTo(2);
    }

    @Test
    void listClientOrders_throwsResourceNotFoundException_whenClientNotFound() {
        UUID clientId = UUID.randomUUID();
        when(clientRepository.existsById(clientId)).thenReturn(false);

        assertThatThrownBy(() -> service.listClientOrders(clientId, 0, 20))
                .isInstanceOf(ResourceNotFoundException.class)
                .hasMessageContaining("Client");
    }

    @Test
    void listClientOrders_returnsPagedResponse_withHydratedItems() {
        UUID clientId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        when(clientRepository.existsById(clientId)).thenReturn(true);

        when(orderRepository.findIdsByClientIdOrderByOrderDateDesc(eq(clientId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(orderId), PageRequest.of(0, 20), 1));
        when(orderRepository.findAllByIdWithItemsAndProduct(anyList())).thenReturn(List.of(orderWithId(orderId, productId)));

        PagedResponse<OrderDTO> response = service.listClientOrders(clientId, 0, 20);

        assertThat(response.items()).hasSize(1);
        assertThat(response.items().get(0).id()).isEqualTo(orderId);
        assertThat(response.items().get(0).items()).hasSize(1);
        assertThat(response.items().get(0).items().get(0).productId()).isEqualTo(productId);
    }

    private Order orderWithId(UUID orderId, UUID productId) {
        Product product = new Product();
        product.setId(productId);
        product.setName("Coffee");

        OrderItem item = new OrderItem();
        item.setProduct(product);
        item.setQuantity(2);
        item.setUnitPrice(new BigDecimal("10.00"));

        Order order = new Order();
        order.setId(orderId);
        order.setTotal(new BigDecimal("20.00"));
        order.setItems(List.of(item));
        return order;
    }
}
