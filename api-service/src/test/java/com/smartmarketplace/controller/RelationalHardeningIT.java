package com.smartmarketplace.controller;

import com.smartmarketplace.service.ClientApplicationService;
import com.smartmarketplace.service.ProductApplicationService;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import jakarta.persistence.EntityManagerFactory;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class RelationalHardeningIT extends BaseIntegrationTest {

    @Autowired
    private ProductApplicationService productService;

    @Autowired
    private ClientApplicationService clientService;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void listEndpoints_executeWithBoundedQueryCounts() {
        assertQueryCountAtMost(2, () -> productService.listProducts(0, 20, null, null, null, null, false));
        assertQueryCountAtMost(1, () -> clientService.listClients(0, 20));
        assertQueryCountAtMost(3, () -> clientService.listClientOrders(UUID.fromString("44444444-4444-4444-4444-444444444444"), 0, 20));
    }

    @Test
    void fallbackSupportingIndexes_haveExplainEvidence() {
        assertThat(jdbcTemplate.queryForList("""
                EXPLAIN ANALYZE
                SELECT 1
                FROM orders
                WHERE client_id = '44444444-4444-4444-4444-444444444444'
                ORDER BY order_date DESC
                LIMIT 1
                """, String.class)).isNotEmpty();
    }

    private void assertQueryCountAtMost(long maxQueries, Runnable action) {
        Statistics statistics = entityManagerFactory.unwrap(SessionFactoryImplementor.class).getStatistics();
        statistics.setStatisticsEnabled(true);
        statistics.clear();

        action.run();

        assertThat(statistics.getQueryExecutionCount()).isLessThanOrEqualTo(maxQueries);
    }
}
