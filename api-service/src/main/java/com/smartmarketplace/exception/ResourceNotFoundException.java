package com.smartmarketplace.exception;

public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String entity, Object id) {
        super(entity + " not found with id: " + id);
    }
}
