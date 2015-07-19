'use strict';

module.exports =
{
    DB: 3,

    OK: "OK",
    NOT_OK: "NOT_OK",
    ERROR: "ERROR",

    ERRORS: {
        UNKNOWN:                "unknown",
        DIFFERENT_POLICY:       "different_policy",
        MALFORMED_TICKET:       "malformed_ticket",
        TOO_MUCH_TICKETS:       "too_much_tickets",
        WRONG_POLICY:           "wrong_policy",
        NOT_FOUND:              "not_found",
        EMPTY_REQUEST:          "empty_request",
        CONTEXT_NOT_FOUND:      "context_not_found",
        TICKET_ALREADY_EXPIRED: "ticket_already_expired",
        MALFORMED_REQUEST:      "malformed_request"
    },

    POLICIES: {
        REQUESTS_BASED:    "requests_based",
        TIME_BASED:        "time_based",
        MANUAL_EXPIRATION: "manual_expiration",
        BANDWIDTH_BASED:   "bandwidth_based",
        CASCADING:         "cascading",
    },

    VALID_TICKET: "VALID",
    VALID_PREFIX: "VALID:",

    EXPIRED_TICKET: "EXPIRED",
    EXPIRED_PREFIX: "EXPIRED:",

    CONTEXTS_PREFIX: "contexts:",

    DEFAULT_EXPIRES_IN_SECONDS : 60,
    DEFAULT_EXPIRES_IN_REQUESTS: 100,
    DEFAULT_REQUESTS_PER_MINUTE: 60,
    DEFAULT_REMEMBER_UNTIL: 60 * 60 * 24 * 10,  // Ten days

    MAX_TICKETS_PER_TIME: 200,

    SPEED: {
        SLOW:   "slow",
        FAST:   "fast",
        FASTER: "faster"
    }
};
