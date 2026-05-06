package com.smartmarketplace.outbox;

import com.smartmarketplace.service.AiSyncClient;
import io.micrometer.core.instrument.MeterRegistry;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import jakarta.annotation.PreDestroy;

@Component
public class OutboxDispatcher {

    private static final Logger log = LoggerFactory.getLogger(OutboxDispatcher.class);

    private final DataSource dataSource;
    private final OutboxDispatchJdbcRepository outboxDispatchJdbcRepository;
    private final AiSyncClient aiSyncClient;
    private final MeterRegistry meterRegistry;
    private final ExecutorService listenerExecutor =
            Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("outbox-listener-", 0).factory());
    private final AtomicBoolean started = new AtomicBoolean(false);
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean draining = new AtomicBoolean(false);
    private final String channelName;
    private final int batchSize;
    private final long leaseMs;
    private final long retryDelayMs;
    private final int notificationTimeoutMs;
    private final long reconnectDelayMs;
    private final String dispatcherId = "api-service:" + UUID.randomUUID();

    public OutboxDispatcher(
            DataSource dataSource,
            OutboxDispatchJdbcRepository outboxDispatchJdbcRepository,
            AiSyncClient aiSyncClient,
            MeterRegistry meterRegistry,
            @Value("${outbox.dispatcher.channel:integration_outbox_new}") String channelName,
            @Value("${outbox.dispatcher.batch-size:10}") int batchSize,
            @Value("${outbox.dispatcher.lease-ms:30000}") long leaseMs,
            @Value("${outbox.dispatcher.retry-delay-ms:5000}") long retryDelayMs,
            @Value("${outbox.dispatcher.notification-timeout-ms:1000}") int notificationTimeoutMs,
            @Value("${outbox.dispatcher.reconnect-delay-ms:1000}") long reconnectDelayMs
    ) {
        this.dataSource = dataSource;
        this.outboxDispatchJdbcRepository = outboxDispatchJdbcRepository;
        this.aiSyncClient = aiSyncClient;
        this.meterRegistry = meterRegistry;
        this.channelName = channelName;
        this.batchSize = batchSize;
        this.leaseMs = leaseMs;
        this.retryDelayMs = retryDelayMs;
        this.notificationTimeoutMs = notificationTimeoutMs;
        this.reconnectDelayMs = reconnectDelayMs;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        if (started.compareAndSet(false, true)) {
            running.set(true);
            listenerExecutor.submit(this::runLoop);
        }
    }

    @Scheduled(
            fixedDelayString = "${outbox.dispatcher.sweep-delay-ms:120000}",
            initialDelayString = "${outbox.dispatcher.sweep-initial-delay-ms:120000}"
    )
    public void sweepPending() {
        if (!running.get()) {
            return;
        }
        listenerExecutor.submit(() -> triggerDrain("schedule"));
    }

    @PreDestroy
    public void stop() {
        running.set(false);
        listenerExecutor.shutdownNow();
        try {
            if (!listenerExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                log.warn("Outbox listener did not stop within timeout");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    void drainPending() {
        while (running.get()) {
            List<ClaimedOutboxEvent> claimedEvents = claimBatch();
            if (claimedEvents.isEmpty()) {
                return;
            }
            for (ClaimedOutboxEvent event : claimedEvents) {
                dispatch(event);
            }
            if (claimedEvents.size() < batchSize) {
                return;
            }
        }
    }

    void triggerDrain(String source) {
        if (!running.get()) {
            return;
        }
        if (!draining.compareAndSet(false, true)) {
            log.debug("Outbox drain already in progress, skipping trigger from {}", source);
            return;
        }
        try {
            drainPending();
        } finally {
            draining.set(false);
        }
    }

    private void runLoop() {
        while (running.get()) {
            try (Connection connection = dataSource.getConnection()) {
                connection.setAutoCommit(true);
                listen(connection);
                triggerDrain("startup");
                PGConnection pgConnection = connection.unwrap(PGConnection.class);
                log.info("Outbox listener ready on channel {}", channelName);

                while (running.get()) {
                    PGNotification[] notifications = pgConnection.getNotifications(notificationTimeoutMs);
                    if (notifications != null && notifications.length > 0) {
                        triggerDrain("notify");
                    }
                }
            } catch (Exception e) {
                if (!running.get()) {
                    return;
                }
                log.warn("Outbox listener disconnected: {}", e.getMessage());
                sleepQuietly(reconnectDelayMs);
            }
        }
    }

    private void listen(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("LISTEN " + channelName);
        }
    }

    private List<ClaimedOutboxEvent> claimBatch() {
        return outboxDispatchJdbcRepository.claimBatch(batchSize, dispatcherId, leaseMs);
    }

    private void dispatch(ClaimedOutboxEvent event) {
        try {
            aiSyncClient.dispatch(event.eventType(), event.payload());
            outboxDispatchJdbcRepository.markProcessed(event.id());
            meterRegistry.counter("outbox.dispatch.success", "eventType", event.eventType().name()).increment();
        } catch (Exception e) {
            log.warn("Outbox dispatch failed for {} {}: {}", event.eventType(), event.id(), e.getMessage());
            outboxDispatchJdbcRepository.markFailed(event.id(), truncate(e.getMessage()), retryDelayMs);
            meterRegistry.counter("outbox.dispatch.failure", "eventType", event.eventType().name()).increment();
        }
    }

    private String truncate(String message) {
        if (message == null) {
            return "unknown";
        }
        if (message.length() <= 1000) {
            return message;
        }
        return message.substring(0, 1000);
    }

    private void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

}
