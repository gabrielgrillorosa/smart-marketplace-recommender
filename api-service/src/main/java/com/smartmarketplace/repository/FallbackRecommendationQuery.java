package com.smartmarketplace.repository;

import com.smartmarketplace.config.CacheNames;
import com.smartmarketplace.dto.RecommendationItemDTO;
import com.smartmarketplace.entity.Product;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public class FallbackRecommendationQuery {

    @PersistenceContext
    private EntityManager em;

    @Cacheable(value = CacheNames.FALLBACK_RECOMMENDATIONS, key = "#countryCode + '-' + #clientId + '-' + #limit")
    public List<RecommendationItemDTO> topSelling(String countryCode, UUID clientId, int limit) {
        @SuppressWarnings("unchecked")
        List<Product> products = em.createQuery("""
                SELECT p FROM Product p
                JOIN p.countries c
                WHERE c.code = :countryCode
                AND p.id NOT IN (
                    SELECT oi.product.id FROM OrderItem oi
                    WHERE oi.order.client.id = :clientId
                )
                ORDER BY (SELECT COALESCE(SUM(oi2.quantity), 0) FROM OrderItem oi2 WHERE oi2.product.id = p.id) DESC
                """)
                .setParameter("countryCode", countryCode)
                .setParameter("clientId", clientId)
                .setMaxResults(limit)
                .getResultList();

        return products.stream()
                .map(p -> new RecommendationItemDTO(
                        p.getId(), p.getName(), p.getCategory(),
                        p.getPrice(), null, "fallback"))
                .toList();
    }
}
