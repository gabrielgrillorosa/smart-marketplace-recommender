package com.smartmarketplace.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AiServiceConfig {

    @Value("${ai.service.base-url}")
    private String baseUrl;

    @Value("${ai.service.timeout.connect}")
    private int connectTimeout;

    @Value("${ai.service.timeout.response}")
    private int responseTimeout;

    public String getBaseUrl() { return baseUrl; }
    public int getConnectTimeout() { return connectTimeout; }
    public int getResponseTimeout() { return responseTimeout; }
}
