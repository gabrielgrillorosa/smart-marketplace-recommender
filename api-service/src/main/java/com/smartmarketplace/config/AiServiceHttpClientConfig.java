package com.smartmarketplace.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class AiServiceHttpClientConfig {

    @Bean
    public HttpClient aiServiceHttpClient(@Value("${ai.service.timeout.connect}") int connectTimeout) {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeout))
                .build();
    }
}
