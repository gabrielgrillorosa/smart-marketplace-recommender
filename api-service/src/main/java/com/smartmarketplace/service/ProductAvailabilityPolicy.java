package com.smartmarketplace.service;

import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.exception.CartItemUnavailableException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Objects;

@Service
public class ProductAvailabilityPolicy {

    public void assertAvailableForClientCountry(Client client, Product product) {
        String productName = resolveProductName(product);
        String clientCountry = resolveClientCountry(client);

        if (clientCountry == null) {
            throw new CartItemUnavailableException(
                    "Product " + productName + " is not available because the client has no country configured");
        }

        boolean availableInCountry = product != null
                && product.getCountries() != null
                && product.getCountries().stream()
                .map(Country::getCode)
                .filter(Objects::nonNull)
                .map(code -> code.trim().toUpperCase(Locale.ROOT))
                .anyMatch(clientCountry::equals);

        if (!availableInCountry) {
            throw new CartItemUnavailableException(
                    "Product " + productName + " is not available in country " + clientCountry);
        }
    }

    public void assertAllAvailableForClientCountry(Client client, List<Product> products) {
        for (Product product : products) {
            assertAvailableForClientCountry(client, product);
        }
    }

    private String resolveClientCountry(Client client) {
        if (client == null || client.getCountry() == null || client.getCountry().getCode() == null) {
            return null;
        }

        String code = client.getCountry().getCode().trim();
        if (code.isBlank()) {
            return null;
        }

        return code.toUpperCase(Locale.ROOT);
    }

    private String resolveProductName(Product product) {
        if (product == null || product.getName() == null) {
            return "Unknown product";
        }

        String name = product.getName().trim();
        return name.isBlank() ? "Unknown product" : name;
    }
}
