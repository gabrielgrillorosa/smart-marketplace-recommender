package com.smartmarketplace.repository;

import com.smartmarketplace.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface CartItemRepository extends JpaRepository<CartItem, UUID> {

    Optional<CartItem> findByCartIdAndProductId(UUID cartId, UUID productId);
}
