package com.smartmarketplace.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
    public CatalogCacheReadiness(
            HttpClient aiServiceHttpClient,
            @Value("${ai.service.base-url}") String aiServiceBaseUrl
    ) {
        this(() -> probeAiServiceReady(aiServiceHttpClient, aiServiceBaseUrl));
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

    private static boolean probeAiServiceReady(HttpClient httpClient, String aiServiceBaseUrl) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(aiServiceBaseUrl + "/ready"))
                .GET()
                .timeout(READY_PROBE_TIMEOUT)
                .build();
        try {
            HttpResponse<Void> response = httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (IOException e) {
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
