package com.smartmarketplace.service;

import com.smartmarketplace.dto.AddCartItemRequest;
import com.smartmarketplace.dto.CartDTO;
import com.smartmarketplace.dto.OrderDTO;
import com.smartmarketplace.dto.OrderItemDTO;
import com.smartmarketplace.entity.Cart;
import com.smartmarketplace.entity.CartItem;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.exception.CartItemUnavailableException;
import com.smartmarketplace.repository.CartRepository;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.ProductRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CartApplicationServiceTest {

    @Mock
    private CartRepository cartRepository;

    @Mock
    private ClientRepository clientRepository;

    @Mock
    private ProductRepository productRepository;

    @Mock
    private ProductAvailabilityPolicy productAvailabilityPolicy;

    @Mock
    private OrderApplicationService orderApplicationService;

    @Mock
    private AiSyncClient aiSyncClient;

    @InjectMocks
    private CartApplicationService cartApplicationService;

    @Test
    void getActiveCart_returnsEmptyContract_whenNoCartExists() {
        UUID clientId = UUID.randomUUID();
        when(clientRepository.existsById(clientId)).thenReturn(true);
        when(cartRepository.findByClientIdWithItems(clientId)).thenReturn(Optional.empty());

        CartDTO result = cartApplicationService.getActiveCart(clientId);

        assertThat(result.cartId()).isNull();
        assertThat(result.clientId()).isEqualTo(clientId);
        assertThat(result.items()).isEmpty();
        assertThat(result.itemCount()).isZero();
    }

    @Test
    void addItem_createsActiveCart_whenClientHasNoCart() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Client client = buildClient(clientId);
        Product product = buildProduct(productId);

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(productRepository.findByIdWithDetails(productId)).thenReturn(Optional.of(product));
        when(cartRepository.findByClientIdWithItems(clientId)).thenReturn(Optional.empty());
        when(cartRepository.save(any(Cart.class))).thenAnswer(invocation -> {
            Cart saved = invocation.getArgument(0, Cart.class);
            if (saved.getId() == null) {
                saved.setId(UUID.randomUUID());
            }
            return saved;
        });

        CartDTO result = cartApplicationService.addItem(clientId, new AddCartItemRequest(productId, 2));

        assertThat(result.cartId()).isNotNull();
        assertThat(result.clientId()).isEqualTo(clientId);
        assertThat(result.itemCount()).isEqualTo(2);
        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().productId()).isEqualTo(productId);
        assertThat(result.items().getFirst().quantity()).isEqualTo(2);
        verify(productAvailabilityPolicy).assertAvailableForClientCountry(client, product);
    }

    @Test
    void addItem_rejectsIncompatibleProduct_beforeCartMutation() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Client client = buildClient(clientId);
        Product product = buildProduct(productId);

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(productRepository.findByIdWithDetails(productId)).thenReturn(Optional.of(product));
        doThrow(new CartItemUnavailableException("Product Organic Snack Bar is not available in country BR"))
                .when(productAvailabilityPolicy)
                .assertAvailableForClientCountry(client, product);

        assertThatThrownBy(() -> cartApplicationService.addItem(clientId, new AddCartItemRequest(productId, 1)))
                .isInstanceOf(CartItemUnavailableException.class)
                .hasMessage("Product Organic Snack Bar is not available in country BR");

        verify(cartRepository, never()).findByClientIdWithItems(clientId);
        verify(cartRepository, never()).save(any(Cart.class));
    }

    @Test
    void addItem_sumsQuantities_whenAddingSameProductTwice() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Client client = buildClient(clientId);
        Product product = buildProduct(productId);
        Cart cart = buildCart(client, List.of(buildCartItem(product, 2)));
        cart.setId(UUID.randomUUID());

        when(clientRepository.findByIdWithCountry(clientId)).thenReturn(Optional.of(client));
        when(productRepository.findByIdWithDetails(productId)).thenReturn(Optional.of(product));
        when(cartRepository.findByClientIdWithItems(clientId)).thenReturn(Optional.of(cart));
        when(cartRepository.save(any(Cart.class))).thenAnswer(invocation -> invocation.getArgument(0, Cart.class));

        CartDTO result = cartApplicationService.addItem(clientId, new AddCartItemRequest(productId, 3));

        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().quantity()).isEqualTo(5);
        assertThat(result.itemCount()).isEqualTo(5);
        verify(productAvailabilityPolicy).assertAvailableForClientCountry(client, product);
    }

    @Test
    void removeItem_deletesCart_whenLastItemIsRemoved() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Client client = buildClient(clientId);
        Product product = buildProduct(productId);
        Cart cart = buildCart(client, List.of(buildCartItem(product, 1)));
        cart.setId(UUID.randomUUID());

        when(clientRepository.existsById(clientId)).thenReturn(true);
        when(cartRepository.findByClientIdWithItems(clientId)).thenReturn(Optional.of(cart));

        CartDTO result = cartApplicationService.removeItem(clientId, productId);

        verify(cartRepository).delete(cart);
        assertThat(result.cartId()).isNull();
        assertThat(result.itemCount()).isZero();
        assertThat(result.items()).isEmpty();
    }

    @Test
    void clearCart_removesActiveCart_andReturnsEmptyContract() {
        UUID clientId = UUID.randomUUID();
        Client client = buildClient(clientId);
        Cart cart = new Cart();
        cart.setId(UUID.randomUUID());
        cart.setClient(client);

        when(clientRepository.existsById(clientId)).thenReturn(true);
        when(cartRepository.findByClientId(clientId)).thenReturn(Optional.of(cart));

        CartDTO result = cartApplicationService.clearCart(clientId);

        verify(cartRepository).delete(cart);
        assertThat(result.cartId()).isNull();
        assertThat(result.clientId()).isEqualTo(clientId);
        assertThat(result.itemCount()).isZero();
    }

    @Test
    void checkout_createsOrderAndClearsCart_whenCartHasItems() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        UUID orderId = UUID.randomUUID();

        Client client = buildClient(clientId);
        Product product = buildProduct(productId);
        Cart cart = buildCart(client, List.of(buildCartItem(product, 2)));
        cart.setId(UUID.randomUUID());

        when(clientRepository.existsById(clientId)).thenReturn(true);
        when(cartRepository.findByClientIdWithItems(clientId)).thenReturn(Optional.of(cart));
        LocalDateTime orderPlacedAt = LocalDateTime.of(2025, 6, 1, 12, 0);
        when(orderApplicationService.createOrder(any())).thenReturn(
                new OrderDTO(orderId, orderPlacedAt, null, List.of(new OrderItemDTO(productId, "Any", 2, null)))
        );

        var response = cartApplicationService.checkout(clientId);

        verify(orderApplicationService).createOrder(any());
        verify(cartRepository).delete(cart);
        verify(aiSyncClient).notifyCheckoutCompleted(eq(orderId), eq(clientId), eq(List.of(productId)), eq(orderPlacedAt));
        assertThat(response.orderId()).isEqualTo(orderId);
        assertThat(response.expectedTrainingTriggered()).isTrue();
    }

    @Test
    void checkout_keepsCart_whenOrderValidationRejectsLegacyIncompatibleItem() {
        UUID clientId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();

        Client client = buildClient(clientId);
        Product product = buildProduct(productId);
        Cart cart = buildCart(client, List.of(buildCartItem(product, 1)));
        cart.setId(UUID.randomUUID());

        when(clientRepository.existsById(clientId)).thenReturn(true);
        when(cartRepository.findByClientIdWithItems(clientId)).thenReturn(Optional.of(cart));
        when(orderApplicationService.createOrder(any()))
                .thenThrow(new CartItemUnavailableException("Product Organic Snack Bar is not available in country BR"));

        assertThatThrownBy(() -> cartApplicationService.checkout(clientId))
                .isInstanceOf(CartItemUnavailableException.class)
                .hasMessage("Product Organic Snack Bar is not available in country BR");

        verify(cartRepository, never()).delete(cart);
        verify(aiSyncClient, never()).notifyCheckoutCompleted(any(), any(), any(), any());
    }

    private static Client buildClient(UUID clientId) {
        Country country = new Country();
        country.setCode("BR");

        Client client = new Client();
        client.setId(clientId);
        client.setCountry(country);
        return client;
    }

    private static Product buildProduct(UUID productId) {
        Product product = new Product();
        product.setId(productId);
        product.setName("Any Product");
        return product;
    }

    private static Cart buildCart(Client client, List<CartItem> items) {
        Cart cart = new Cart();
        cart.setClient(client);
        cart.getItems().addAll(items);
        for (CartItem item : cart.getItems()) {
            item.setCart(cart);
        }
        return cart;
    }

    private static CartItem buildCartItem(Product product, int quantity) {
        CartItem item = new CartItem();
        item.setProduct(product);
        item.setQuantity(quantity);
        return item;
    }
}
