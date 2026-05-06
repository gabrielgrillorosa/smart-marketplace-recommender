package com.smartmarketplace.repository;

import com.smartmarketplace.entity.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;
import java.util.List;

public interface OrderRepository extends JpaRepository<Order, UUID> {

    @Query(
            value = """
                    SELECT o.id
                    FROM Order o
                    WHERE o.client.id = :clientId
                    ORDER BY o.orderDate DESC
                    """,
            countQuery = "SELECT COUNT(o) FROM Order o WHERE o.client.id = :clientId"
    )
    Page<UUID> findIdsByClientIdOrderByOrderDateDesc(@Param("clientId") UUID clientId, Pageable pageable);

    @Query("""
            SELECT DISTINCT o
            FROM Order o
            LEFT JOIN FETCH o.items oi
            LEFT JOIN FETCH oi.product
            WHERE o.id IN :ids
            """)
    List<Order> findAllByIdWithItemsAndProduct(@Param("ids") List<UUID> ids);

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
