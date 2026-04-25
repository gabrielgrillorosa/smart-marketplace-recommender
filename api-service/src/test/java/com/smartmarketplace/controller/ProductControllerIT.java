package com.smartmarketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.hamcrest.Matchers.anyOf;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ProductControllerIT extends BaseIntegrationTest {

    private static final String SEEDED_PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void listProducts_returnsOkWithItemsArray() throws Exception {
        mockMvc.perform(get("/api/v1/products"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items", notNullValue()));
    }

    @Test
    void getProduct_withSeededId_returnsOkAndProductData() throws Exception {
        mockMvc.perform(get("/api/v1/products/{id}", SEEDED_PRODUCT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(SEEDED_PRODUCT_ID)))
                .andExpect(jsonPath("$.sku", is("SKU-001")))
                .andExpect(jsonPath("$.name", is("Premium Coffee Beans")))
                .andExpect(jsonPath("$.category", is("beverages")));
    }

    @Test
    void getProduct_withUnknownId_returnsNotFoundWithErrorBody() throws Exception {
        UUID unknown = UUID.randomUUID();
        mockMvc.perform(get("/api/v1/products/{id}", unknown))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath(
                        "$",
                        anyOf(
                                org.hamcrest.Matchers.hasKey("error"),
                                org.hamcrest.Matchers.hasKey("message"))));
    }
}
