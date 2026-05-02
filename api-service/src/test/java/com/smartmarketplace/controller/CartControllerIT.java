package com.smartmarketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CartControllerIT extends BaseIntegrationTest {

    private static final String SEEDED_CLIENT_ID = "44444444-4444-4444-4444-444444444444";
    private static final String SEEDED_US_CLIENT_ID = "55555555-5555-5555-5555-555555555555";
    private static final String PRODUCT_A = "22222222-2222-2222-2222-222222222222";
    private static final String PRODUCT_B = "33333333-3333-3333-3333-333333333333";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void cartCrudFlow_addGetRemoveAndClear_worksAsExpected() throws Exception {
        mockMvc.perform(get("/api/v1/carts/{clientId}", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cartId", nullValue()))
                .andExpect(jsonPath("$.itemCount").value(0))
                .andExpect(jsonPath("$.items", hasSize(0)));

        mockMvc.perform(post("/api/v1/carts/{clientId}/items", SEEDED_CLIENT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "productId": "%s", "quantity": 2 }
                                """.formatted(PRODUCT_A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(2))
                .andExpect(jsonPath("$.items", hasSize(1)));

        mockMvc.perform(post("/api/v1/carts/{clientId}/items", SEEDED_CLIENT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "productId": "%s", "quantity": 1 }
                                """.formatted(PRODUCT_B)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(3))
                .andExpect(jsonPath("$.items", hasSize(2)));

        mockMvc.perform(get("/api/v1/carts/{clientId}", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(3))
                .andExpect(jsonPath("$.items", hasSize(2)));

        mockMvc.perform(delete("/api/v1/carts/{clientId}/items/{productId}", SEEDED_CLIENT_ID, PRODUCT_A))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)));

        mockMvc.perform(get("/api/v1/carts/{clientId}", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)));

        mockMvc.perform(delete("/api/v1/carts/{clientId}", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cartId", nullValue()))
                .andExpect(jsonPath("$.itemCount").value(0))
                .andExpect(jsonPath("$.items", hasSize(0)));
    }

    @Test
    void checkoutFlow_createsOrderAndClearsCart() throws Exception {
        mockMvc.perform(post("/api/v1/carts/{clientId}/items", SEEDED_CLIENT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "productId": "%s", "quantity": 1 }
                                """.formatted(PRODUCT_A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(1));

        mockMvc.perform(post("/api/v1/carts/{clientId}/checkout", SEEDED_CLIENT_ID))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.orderId").exists())
                .andExpect(jsonPath("$.expectedTrainingTriggered").value(false));

        mockMvc.perform(get("/api/v1/carts/{clientId}", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cartId", nullValue()))
                .andExpect(jsonPath("$.itemCount").value(0));

        mockMvc.perform(get("/api/v1/clients/{clientId}/orders", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items[0].id").exists());
    }

    @Test
    void checkout_withEmptyCart_returns422() throws Exception {
        mockMvc.perform(post("/api/v1/carts/{clientId}/checkout", SEEDED_CLIENT_ID))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Cart is empty - add items before checkout"));
    }

    @Test
    void addItem_returns422AndKeepsCartUnchanged_whenProductIsIncompatibleWithClientCountry() throws Exception {
        mockMvc.perform(post("/api/v1/carts/{clientId}/items", SEEDED_US_CLIENT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "productId": "%s", "quantity": 1 }
                                """.formatted(PRODUCT_B)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Product Organic Snack Bar is not available in country US"));

        mockMvc.perform(get("/api/v1/carts/{clientId}", SEEDED_US_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cartId", nullValue()))
                .andExpect(jsonPath("$.itemCount").value(0))
                .andExpect(jsonPath("$.items", hasSize(0)));

        mockMvc.perform(post("/api/v1/carts/{clientId}/items", SEEDED_US_CLIENT_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                { "productId": "%s", "quantity": 1 }
                                """.formatted(PRODUCT_A)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.itemCount").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)));
    }

    @Test
    void checkout_returns422ForLegacyIncompatibleCart_withSharedPolicyMessage() throws Exception {
        UUID cartId = UUID.randomUUID();
        UUID cartItemId = UUID.randomUUID();

        jdbcTemplate.update("INSERT INTO carts (id, client_id) VALUES (?, ?)", cartId, UUID.fromString(SEEDED_US_CLIENT_ID));
        jdbcTemplate.update(
                "INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES (?, ?, ?, ?)",
                cartItemId,
                cartId,
                UUID.fromString(PRODUCT_B),
                1
        );

        mockMvc.perform(post("/api/v1/carts/{clientId}/checkout", SEEDED_US_CLIENT_ID))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("Product Organic Snack Bar is not available in country US"));

        mockMvc.perform(get("/api/v1/carts/{clientId}", SEEDED_US_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cartId").value(cartId.toString()))
                .andExpect(jsonPath("$.itemCount").value(1))
                .andExpect(jsonPath("$.items", hasSize(1)));
    }
}
