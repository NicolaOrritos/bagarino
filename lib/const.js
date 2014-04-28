'use strict';

module.exports = {
    
    OK: "OK",
    NOT_OK: "NOT_OK",
    ERROR: "ERROR",
    
    VALID_TICKET: "VALID",
    VALID_PREFIX: "VALID:",
    
    EXPIRED_TICKET: "EXPIRED",
    EXPIRED_PREFIX: "EXPIRED:",
    
    CONTEXTS_PREFIX: "contexts:",
    
    DEFAULT_EXPIRES_IN_SECONDS : 60,
    DEFAULT_EXPIRES_IN_REQUESTS: 100,
    DEFAULT_REQUESTS_PER_MINUTE: 60,
    
    DEFAULT_REMEMBER_UNTIL: 60 * 60 * 24 * 10,  // Ten days
    
    MAX_TICKETS_PER_TIME: 200
    
};
