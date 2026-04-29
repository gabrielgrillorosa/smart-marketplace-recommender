package com.smartmarketplace.exception;

public class CartEmptyException extends CartSemanticException {

    public CartEmptyException() {
        super("Cart is empty - add items before checkout");
    }
}
