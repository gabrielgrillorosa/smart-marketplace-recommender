package com.smartmarketplace.service;

import com.smartmarketplace.dto.AddCartItemRequest;
import com.smartmarketplace.dto.CartDTO;
import com.smartmarketplace.dto.CartItemDTO;
import com.smartmarketplace.dto.CheckoutResponse;
import com.smartmarketplace.dto.CreateOrderRequest;
import com.smartmarketplace.entity.Cart;
import com.smartmarketplace.entity.CartItem;
import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.exception.CartEmptyException;
import com.smartmarketplace.exception.ResourceNotFoundException;
import com.smartmarketplace.repository.CartRepository;
import com.smartmarketplace.repository.ClientRepository;
import com.smartmarketplace.repository.ProductRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
public class CartApplicationService {

    private final CartRepository cartRepository;
    private final ClientRepository clientRepository;
    private final ProductRepository productRepository;
    private final ProductAvailabilityPolicy productAvailabilityPolicy;
    private final OrderApplicationService orderApplicationService;
    private final AiSyncClient aiSyncClient;

    public CartApplicationService(CartRepository cartRepository,
                                  ClientRepository clientRepository,
                                  ProductRepository productRepository,
                                  ProductAvailabilityPolicy productAvailabilityPolicy,
                                  OrderApplicationService orderApplicationService,
                                  AiSyncClient aiSyncClient) {
        this.cartRepository = cartRepository;
        this.clientRepository = clientRepository;
        this.productRepository = productRepository;
        this.productAvailabilityPolicy = productAvailabilityPolicy;
        this.orderApplicationService = orderApplicationService;
        this.aiSyncClient = aiSyncClient;
    }

    @Transactional(readOnly = true)
    public CartDTO getActiveCart(UUID clientId) {
        requireClient(clientId);
        return cartRepository.findByClientIdWithItems(clientId)
                .map(this::toDto)
                .orElseGet(() -> emptyCart(clientId));
    }

    @Transactional
    public CartDTO addItem(UUID clientId, AddCartItemRequest request) {
        Client client = clientRepository.findByIdWithCountry(clientId)
                .orElseThrow(() -> new ResourceNotFoundException("Client", clientId));
        Product product = productRepository.findByIdWithDetails(request.productId())
                .orElseThrow(() -> new ResourceNotFoundException("Product", request.productId()));

        productAvailabilityPolicy.assertAvailableForClientCountry(client, product);

        Cart cart = cartRepository.findByClientIdWithItems(clientId)
                .orElseGet(() -> {
                    Cart created = new Cart();
                    created.setClient(client);
                    return created;
                });

        CartItem existingItem = cart.getItems().stream()
                .filter(item -> item.getProduct().getId().equals(product.getId()))
                .findFirst()
                .orElse(null);

        if (existingItem != null) {
            existingItem.setQuantity(existingItem.getQuantity() + request.quantity());
        } else {
            CartItem item = new CartItem();
            item.setCart(cart);
            item.setProduct(product);
            item.setQuantity(request.quantity());
            cart.getItems().add(item);
        }

        Cart saved = cartRepository.save(cart);
        return toDto(saved);
    }

    @Transactional
    public CartDTO removeItem(UUID clientId, UUID productId) {
        requireClient(clientId);

        Cart cart = cartRepository.findByClientIdWithItems(clientId).orElse(null);
        if (cart == null) {
            return emptyCart(clientId);
        }

        cart.getItems().removeIf(item -> item.getProduct().getId().equals(productId));

        if (cart.getItems().isEmpty()) {
            cartRepository.delete(cart);
            return emptyCart(clientId);
        }

        Cart saved = cartRepository.save(cart);
        return toDto(saved);
    }

    @Transactional
    public CartDTO clearCart(UUID clientId) {
        requireClient(clientId);
        cartRepository.findByClientId(clientId).ifPresent(cartRepository::delete);
        return emptyCart(clientId);
    }

    @Transactional
    public CheckoutResponse checkout(UUID clientId) {
        requireClient(clientId);
        Cart cart = cartRepository.findByClientIdWithItems(clientId)
                .orElseThrow(CartEmptyException::new);

        if (cart.getItems().isEmpty()) {
            throw new CartEmptyException();
        }

        List<CreateOrderRequest.OrderItemRequest> orderItems = cart.getItems().stream()
                .map(item -> new CreateOrderRequest.OrderItemRequest(item.getProduct().getId(), item.getQuantity()))
                .toList();
        List<UUID> productIds = cart.getItems().stream()
                .map(item -> item.getProduct().getId())
                .toList();

        var order = orderApplicationService.createOrder(new CreateOrderRequest(clientId, orderItems));
        cartRepository.delete(cart);

        Runnable notifyCheckoutSync = () -> aiSyncClient.notifyCheckoutCompleted(
                order.id(),
                clientId,
                productIds,
                Objects.requireNonNull(order.orderDate(), "orderDate"));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    notifyCheckoutSync.run();
                }
            });
        } else {
            notifyCheckoutSync.run();
        }

        return new CheckoutResponse(order.id(), true);
    }

    private void requireClient(UUID clientId) {
        if (!clientRepository.existsById(clientId)) {
            throw new ResourceNotFoundException("Client", clientId);
        }
    }

    private CartDTO toDto(Cart cart) {
        List<CartItemDTO> items = cart.getItems().stream()
                .sorted(Comparator.comparing(item -> item.getProduct().getId()))
                .map(item -> new CartItemDTO(item.getProduct().getId(), item.getQuantity()))
                .toList();
        int itemCount = items.stream().mapToInt(CartItemDTO::quantity).sum();
        return new CartDTO(cart.getId(), cart.getClient().getId(), items, itemCount);
    }

    private CartDTO emptyCart(UUID clientId) {
        return new CartDTO(null, clientId, List.of(), 0);
    }
}
