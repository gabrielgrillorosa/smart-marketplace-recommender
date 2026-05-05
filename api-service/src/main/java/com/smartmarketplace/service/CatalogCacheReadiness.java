package com.smartmarketplace.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

@Service
public class CatalogCacheReadiness {

    private static final Logger log = LoggerFactory.getLogger(CatalogCacheReadiness.class);
    private static final Duration READY_PROBE_TIMEOUT = Duration.ofMillis(500);

    private final BooleanSupplier readyProbe;
    private final AtomicBoolean cacheEnabled = new AtomicBoolean(false);

    @Autowired
    public CatalogCacheReadiness(WebClient aiWebClient) {
        this(() -> probeAiServiceReady(aiWebClient));
    }

    CatalogCacheReadiness(BooleanSupplier readyProbe) {
        this.readyProbe = readyProbe;
    }

    public boolean isCacheEnabled() {
        if (cacheEnabled.get()) {
            return true;
        }

        boolean ready;
        try {
            ready = readyProbe.getAsBoolean();
        } catch (RuntimeException ex) {
            ready = false;
        }

        if (ready && cacheEnabled.compareAndSet(false, true)) {
            log.info("[CatalogCache] Enabled after ai-service /ready returned 200");
        }

        return cacheEnabled.get();
    }

    private static boolean probeAiServiceReady(WebClient aiWebClient) {
        Boolean ready = aiWebClient.get()
                .uri("/ready")
                .exchangeToMono(response -> Mono.just(response.statusCode().is2xxSuccessful()))
                .timeout(READY_PROBE_TIMEOUT)
                .onErrorReturn(false)
                .block();
        return Boolean.TRUE.equals(ready);
    }
}
