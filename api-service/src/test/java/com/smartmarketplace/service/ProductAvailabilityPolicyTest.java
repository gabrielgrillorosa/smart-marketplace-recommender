package com.smartmarketplace.service;

import com.smartmarketplace.entity.Client;
import com.smartmarketplace.entity.Country;
import com.smartmarketplace.entity.Product;
import com.smartmarketplace.exception.CartItemUnavailableException;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ProductAvailabilityPolicyTest {

    private final ProductAvailabilityPolicy policy = new ProductAvailabilityPolicy();

    @Test
    void assertAvailableForClientCountry_allowsCompatibleProduct() {
        Client client = buildClient("BR");
        Product product = buildProduct("Premium Coffee Beans", Set.of(buildCountry("BR"), buildCountry("US")));

        assertThatCode(() -> policy.assertAvailableForClientCountry(client, product))
                .doesNotThrowAnyException();
    }

    @Test
    void assertAvailableForClientCountry_rejectsIncompatibleProduct() {
        Client client = buildClient("US");
        Product product = buildProduct("Organic Snack Bar", Set.of(buildCountry("BR")));

        assertThatThrownBy(() -> policy.assertAvailableForClientCountry(client, product))
                .isInstanceOf(CartItemUnavailableException.class)
                .hasMessage("Product Organic Snack Bar is not available in country US");
    }

    @Test
    void assertAvailableForClientCountry_rejectsMissingClientCountry() {
        Client client = new Client();
        Product product = buildProduct("Organic Snack Bar", Set.of(buildCountry("BR")));

        assertThatThrownBy(() -> policy.assertAvailableForClientCountry(client, product))
                .isInstanceOf(CartItemUnavailableException.class)
                .hasMessage("Product Organic Snack Bar is not available because the client has no country configured");
    }

    @Test
    void assertAvailableForClientCountry_rejectsMissingProductCountries() {
        Client client = buildClient("BR");
        Product product = buildProduct("Organic Snack Bar", Set.of());

        assertThatThrownBy(() -> policy.assertAvailableForClientCountry(client, product))
                .isInstanceOf(CartItemUnavailableException.class)
                .hasMessage("Product Organic Snack Bar is not available in country BR");
    }

    @Test
    void assertAllAvailableForClientCountry_pointsToFirstIncompatibleProduct() {
        Client client = buildClient("BR");
        Product compatible = buildProduct("Premium Coffee Beans", Set.of(buildCountry("BR")));
        Product firstIncompatible = buildProduct("US Only Soda", Set.of(buildCountry("US")));
        Product laterIncompatible = buildProduct("CA Only Snack", Set.of(buildCountry("CA")));

        assertThatThrownBy(() -> policy.assertAllAvailableForClientCountry(
                client,
                List.of(compatible, firstIncompatible, laterIncompatible)
        ))
                .isInstanceOf(CartItemUnavailableException.class)
                .hasMessage("Product US Only Soda is not available in country BR");
    }

    private static Client buildClient(String countryCode) {
        Client client = new Client();
        client.setCountry(buildCountry(countryCode));
        return client;
    }

    private static Product buildProduct(String name, Set<Country> countries) {
        Product product = new Product();
        product.setName(name);
        product.setCountries(countries);
        return product;
    }

    private static Country buildCountry(String code) {
        Country country = new Country();
        country.setCode(code);
        country.setName(code);
        return country;
    }
}
