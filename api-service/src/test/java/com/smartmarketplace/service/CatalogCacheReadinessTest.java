package com.smartmarketplace.service;

import org.junit.jupiter.api.Test;

import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

class CatalogCacheReadinessTest {

    @Test
    void isCacheEnabled_latchesTrue_afterFirstSuccessfulProbe() {
        AtomicInteger probeCalls = new AtomicInteger(0);
        CatalogCacheReadiness readiness = new CatalogCacheReadiness(
                () -> probeCalls.incrementAndGet() >= 2
        );

        assertThat(readiness.isCacheEnabled()).isFalse();
        assertThat(readiness.isCacheEnabled()).isTrue();
        assertThat(readiness.isCacheEnabled()).isTrue();
        assertThat(probeCalls.get()).isEqualTo(2);
    }

    @Test
    void isCacheEnabled_staysFalse_whenProbeThrows() {
        AtomicInteger probeCalls = new AtomicInteger(0);
        CatalogCacheReadiness readiness = new CatalogCacheReadiness(
                () -> {
                    probeCalls.incrementAndGet();
                    throw new IllegalStateException("ai-service unavailable");
                }
        );

        assertThat(readiness.isCacheEnabled()).isFalse();
        assertThat(readiness.isCacheEnabled()).isFalse();
        assertThat(probeCalls.get()).isEqualTo(2);
    }
}
