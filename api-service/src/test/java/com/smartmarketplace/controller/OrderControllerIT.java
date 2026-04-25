package com.smartmarketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Integration tests for the order-history endpoint.
 *
 * The endpoint under test is {@code GET /api/v1/clients/{id}/orders}, which
 * is mapped on {@code ClientController} but covers the order read-path
 * behaviour. Order creation lives on {@code OrderController}.
 */
class OrderControllerIT extends BaseIntegrationTest {

    private static final String SEEDED_CLIENT_ID = "44444444-4444-4444-4444-444444444444";
    private static final String SEEDED_PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void listClientOrders_withSeededClient_returnsOkAndItems() throws Exception {
        mockMvc.perform(get("/api/v1/clients/{clientId}/orders", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items", notNullValue()));
    }

    @Test
    void listClientOrders_withUnknownClient_returnsNotFound() throws Exception {
        UUID unknown = UUID.randomUUID();
        mockMvc.perform(get("/api/v1/clients/{clientId}/orders", unknown))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath(
                        "$",
                        anyOf(
                                org.hamcrest.Matchers.hasKey("error"),
                                org.hamcrest.Matchers.hasKey("message"))));
    }

    @Test
    void createOrder_happyPath_returnsCreatedWithOrderBody() throws Exception {
        String body = """
                {
                  "clientId": "%s",
                  "items": [
                    { "productId": "%s", "quantity": 2 }
                  ]
                }
                """.formatted(SEEDED_CLIENT_ID, SEEDED_PRODUCT_ID);

        mockMvc.perform(post("/api/v1/orders")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id", notNullValue()))
                .andExpect(jsonPath("$.items").isArray());
    }
}
