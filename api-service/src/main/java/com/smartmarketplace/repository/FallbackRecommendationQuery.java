package com.smartmarketplace.repository;

import com.smartmarketplace.config.CacheNames;
import com.smartmarketplace.dto.RecommendationViewItemDTO;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;

@Repository
public class FallbackRecommendationQuery {

    private static final String TOP_SELLING_SQL = """
            SELECT p.id,
                   p.name,
                   p.category,
                   p.price,
                   p.sku
            FROM products p
            JOIN product_countries pc ON pc.product_id = p.id
            LEFT JOIN order_items sales_oi ON sales_oi.product_id = p.id
            WHERE pc.country_code = :countryCode
              AND NOT EXISTS (
                  SELECT 1
                  FROM order_items purchased_oi
                  JOIN orders o ON o.id = purchased_oi.order_id
                  WHERE purchased_oi.product_id = p.id
                    AND o.client_id = :clientId
              )
            GROUP BY p.id, p.name, p.category, p.price, p.sku
            ORDER BY COALESCE(SUM(sales_oi.quantity), 0) DESC, p.name ASC
            LIMIT :limit
            """;

    private static final String TOP_SELLING_FROM_CART_SQL = """
            WITH cart_categories AS (
                SELECT p.category, COUNT(*) AS category_weight
                FROM products p
                WHERE p.id IN (:cartProductIds)
                GROUP BY p.category
            )
            SELECT p.id,
                   p.name,
                   p.category,
                   p.price,
                   p.sku
            FROM products p
            JOIN product_countries pc ON pc.product_id = p.id
            LEFT JOIN order_items sales_oi ON sales_oi.product_id = p.id
            LEFT JOIN cart_categories cc ON cc.category = p.category
            WHERE pc.country_code = :countryCode
              AND p.id NOT IN (:cartProductIds)
              AND NOT EXISTS (
                  SELECT 1
                  FROM order_items purchased_oi
                  JOIN orders o ON o.id = purchased_oi.order_id
                  WHERE purchased_oi.product_id = p.id
                    AND o.client_id = :clientId
              )
            GROUP BY p.id, p.name, p.category, p.price, p.sku, cc.category_weight
            ORDER BY COALESCE(cc.category_weight, 0) DESC,
                     COALESCE(SUM(sales_oi.quantity), 0) DESC,
                     p.name ASC
            LIMIT :limit
            """;

    private static final RowMapper<RecommendationViewItemDTO> ROW_MAPPER = FallbackRecommendationQuery::mapItem;

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public FallbackRecommendationQuery(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Cacheable(value = CacheNames.FALLBACK_RECOMMENDATIONS, key = "#countryCode + '-' + #clientId + '-' + #limit")
    public List<RecommendationViewItemDTO> topSelling(String countryCode, UUID clientId, int limit) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("countryCode", countryCode)
                .addValue("clientId", clientId)
                .addValue("limit", limit);
        return jdbcTemplate.query(TOP_SELLING_SQL, params, ROW_MAPPER);
    }

    public List<RecommendationViewItemDTO> topSellingForCart(
            String countryCode,
            UUID clientId,
            List<UUID> cartProductIds,
            int limit
    ) {
        if (cartProductIds == null || cartProductIds.isEmpty()) {
            return topSelling(countryCode, clientId, limit);
        }

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("countryCode", countryCode)
                .addValue("clientId", clientId)
                .addValue("cartProductIds", cartProductIds)
                .addValue("limit", limit);
        return jdbcTemplate.query(TOP_SELLING_FROM_CART_SQL, params, ROW_MAPPER);
    }

    private static RecommendationViewItemDTO mapItem(ResultSet rs, int rowNum) throws SQLException {
        return new RecommendationViewItemDTO(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getString("category"),
                rs.getBigDecimal("price"),
                rs.getString("sku"),
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                true,
                "fallback",
                null,
                null
        );
    }
}
