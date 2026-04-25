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

class ClientControllerIT extends BaseIntegrationTest {

    private static final String SEEDED_CLIENT_ID = "44444444-4444-4444-4444-444444444444";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void listClients_returnsOkWithItemsArray() throws Exception {
        mockMvc.perform(get("/api/v1/clients"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray())
                .andExpect(jsonPath("$.items", notNullValue()));
    }

    @Test
    void getClient_withSeededId_returnsOkAndClientData() throws Exception {
        mockMvc.perform(get("/api/v1/clients/{id}", SEEDED_CLIENT_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id", is(SEEDED_CLIENT_ID)))
                .andExpect(jsonPath("$.name", is("Test Client BR")))
                .andExpect(jsonPath("$.segment", is("retail")))
                .andExpect(jsonPath("$.countryCode", is("BR")));
    }

    @Test
    void getClient_withUnknownId_returnsNotFoundWithErrorBody() throws Exception {
        UUID unknown = UUID.randomUUID();
        mockMvc.perform(get("/api/v1/clients/{id}", unknown))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath(
                        "$",
                        anyOf(
                                org.hamcrest.Matchers.hasKey("error"),
                                org.hamcrest.Matchers.hasKey("message"))));
    }
}
