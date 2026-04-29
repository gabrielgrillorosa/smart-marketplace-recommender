package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Cart;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface CartRepository extends JpaRepository<Cart, UUID> {

    Optional<Cart> findByClientId(UUID clientId);

    @Query("""
            SELECT DISTINCT c
            FROM Cart c
            LEFT JOIN FETCH c.items ci
            LEFT JOIN FETCH ci.product
            WHERE c.client.id = :clientId
            """)
    Optional<Cart> findByClientIdWithItems(@Param("clientId") UUID clientId);
}
