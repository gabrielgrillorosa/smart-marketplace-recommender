package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    Page<Order> findByClientIdOrderByOrderDateDesc(@Param("clientId") UUID clientId, Pageable pageable);

    @Query("""
            SELECT new com.smartmarketplace.dto.PurchaseSummaryDTO(
                COUNT(DISTINCT o.id),
                COALESCE(SUM(oi.quantity), 0),
                COALESCE(SUM(oi.quantity * oi.unitPrice), 0),
                MAX(o.orderDate)
            )
            FROM Order o LEFT JOIN o.items oi
            WHERE o.client.id = :clientId
            """)
    com.smartmarketplace.dto.PurchaseSummaryDTO findPurchaseSummaryByClientId(@Param("clientId") UUID clientId);
}
