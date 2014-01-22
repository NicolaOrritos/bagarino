
// [todo] - Add a clarification about bandwidth-based tickets: they never expire, they simply can be spent a fixed amount of times within a minute
// [todo] - Add new docs for auto-renewable tickets

var hash = require('node_hash');
var redis = require("redis");

var client = redis.createClient();

client.on("error", function (err)
{
    global.log.error("Got an error from the Redis client: " + err);
});

var REDIS_DB = 3;

var NOT_VALID_TICKET = "NOT_VALID";

var VALID_TICKET = "VALID";
var VALID_PREFIX = "VALID:";

var EXPIRED_TICKET = "EXPIRED";
var EXPIRED_PREFIX = "EXPIRED:";

var DEFAULT_EXPIRES_IN_SECONDS  = 60;
var DEFAULT_EXPIRES_IN_REQUESTS = 100;
var DEFAULT_REQUESTS_PER_MINUTE = 60;

var DEFAULT_REMEMBER_UNTIL = 60 * 60 * 24 * 10;  // Ten days

var MAX_TICKETS_PER_TIME = 200;


// [todo] - Add bandwidth-based policy
function calculateExpirationPolicy(query_string, save_ticket)
{
    if (save_ticket)
    if (query_string)
    {
        var policy = {
            // Policies available for tickets:
            time_based: false,
            requests_based: false,
            manual_expiration: false,
            cascading: false,
            bandwidth_based: false,
            
            // When the ticket has a cascading policy this one tracks the ticket this one depends on:
            depends_on: undefined,
            
            // Track an optional context for this ticket
            context: undefined,
            
            // Auto-renewable ticket?
            autorenew: false,
            
            // Can expiration be forced?
            can_force_expiration: false,
            
            // Number of seconds/requests until this ticket expires
            expires_in: undefined,
            remember_until: DEFAULT_REMEMBER_UNTIL
        };
        
        
        // The policy may contain a "context":
        if (query_string.context)
        {
            policy.context = query_string.context;
        }
        
        if (query_string.autorenew)
        {
            policy.autorenew = (query_string.autorenew === true || query_string.autorenew === "true");
        }
        
        if (query_string.can_force_expiration)
        {
            policy.can_force_expiration = (query_string.can_force_expiration === true || query_string.can_force_expiration === "true");
        }
        
        
        if (query_string.policy == "requests_based")
        {
            policy.requests_based = true;
            
            if (query_string.requests)
            {
                var reqs = parseInt(query_string.requests);
                
                if (secs != NaN)
                {
                    policy.expires_in = reqs;
                }
                else
                {
                    policy.expires_in = DEFAULT_EXPIRES_IN_REQUESTS;
                }
            }
            else
            {
                policy.expires_in = DEFAULT_EXPIRES_IN_REQUESTS;
            }
            
            if (policy.autorenew)
            {
                policy.original_expires_in = policy.expires_in;
            }
            
            
            save_ticket.call(this, policy);
        }
        else if (query_string.policy == "manual_expiration")
        {
            policy.manual_expiration = true;
            
            save_ticket.call(this, policy);
        }
        else if (query_string.policy == "time_based")
        {
            policy.time_based = true;
            
            if (query_string.seconds)
            {
                var secs = parseInt(query_string.seconds);
                
                if (secs != NaN)
                {
                    policy.expires_in = secs;
                }
                else
                {
                    policy.expires_in = DEFAULT_EXPIRES_IN_SECONDS;
                }
            }
            else
            {
                policy.expires_in = DEFAULT_EXPIRES_IN_SECONDS;
            }
            
            
            save_ticket.call(this, policy);
        }
        else if (query_string.policy == "cascading")
        {
            policy.cascading = true;
            
            var dep_ticket = query_string.depends_on;
            
            global.log.debug("Creating cascading-policy ticket dependent on ticket '%s'", dep_ticket);
            
            if (dep_ticket)
            {
                client.select(REDIS_DB, function()
                {
                    client.exists(VALID_PREFIX + dep_ticket, function(error, exists)
                    {
                        if(exists)
                        {
                            global.log.debug("Dependency ticket '%s' exists", dep_ticket);
                            
                            policy.depends_on = dep_ticket;
                            
                            global.log.debug("Resulting policy for cascading ticket is: " + JSON.stringify(policy));
                        }
                        else
                        {
                            global.log.debug("Dependency ticket '%s' DOES NOT exists", dep_ticket);
                            
                            policy = undefined;
                        }
                        
                        
                        save_ticket.call(this, policy);
                    });
                });
            }
            else
            {
                policy = undefined;
                
                save_ticket.call(this, policy);
            }
        }
        else if (query_string.policy == "bandwidth_based")
        {
            policy.bandwidth_based = true;
            
            if (query_string.reqs_per_minute)
            {
                var reqs = parseInt(query_string.reqs_per_minute);
                
                if (reqs != NaN)
                {
                    policy.expires_in = reqs;
                }
                else
                {
                    policy.expires_in = DEFAULT_REQUESTS_PER_MINUTE;
                }
            }
            else
            {
                policy.expires_in = DEFAULT_REQUESTS_PER_MINUTE;
            }
            
            
            save_ticket.call(this, policy);
        }
        else
        {
            policy = undefined;
            
            save_ticket.call(this, policy);
        }
    }
    else
    {
        // Call the save_ticket function passing undefined:
        save_ticket.call(this, undefined);
    }
}

function createNewTicket()
{
    var now = new Date().getTime().toString();
        
    global.log.debug("Generating ticket from current date and time (since epoch): %s", now);
    
    now += Math.random();
    
    global.log.debug("After adding random salt: %s", now);
    
    var ticket = hash.sha1(now);
    
    return ticket;
}

function isAutorenewable(policy)
{
    var result = false;
    
    if (policy)
    {
        result = (policy.autorenew === true || policy.autorenew === "true");
    }
    
    return result;
}

function handleTimeBasedTicketResponse(ticket_base, res)
{
    client.select(REDIS_DB, function()
    {
        client.ttl(VALID_PREFIX + ticket_base, function(error, ttl)
        {
            var reply = {"status": VALID_TICKET, "expires_in": ttl, "policy": "time_based"};
            
            res.send(reply);
        });
    });
}

function handleRequestsBasedTicketResponse(ticket_base, res)
{
    client.select(REDIS_DB, function()
    {
        client.hget(VALID_PREFIX + ticket_base, "policy", function(err, policy_str)
        {
            if (policy_str)
            {
                var policy = JSON.parse(policy_str);
                
                if (policy.requests_based)
                {
                    if (policy.expires_in == 0)
                    {
                        var reply = {"status": EXPIRED_TICKET};
                        
                        res.send(reply);
                        
                        client.del(VALID_PREFIX + ticket_base);
                    }
                    else
                    {
                        policy.expires_in -= 1;
                        
                        client.hset(VALID_PREFIX + ticket_base, "policy", JSON.stringify(policy));
                        
                        var reply = {"status": VALID_TICKET, "expires_in": policy.expires_in, "policy": "requests_based"};
                        
                        if (isAutorenewable(policy))
                        if (policy.expires_in === 0 || policy.expires_in === "0")
                        {
                            // Create a new ticket and serve it alongside the other info
                            var newTicket = createNewTicket();
                            var valid_ticket   = VALID_PREFIX   + newTicket;
                            var expired_ticket = EXPIRED_PREFIX + newTicket;
                            
                            var newPolicy = policy;
                            newPolicy.expires_in = newPolicy.original_expires_in = policy.original_expires_in;
                            
                            // First save the "next" ticket:
                            client.hset(valid_ticket, "content", VALID_TICKET);
                            client.hset(valid_ticket, "policy", JSON.stringify(newPolicy));
                            
                            // Then save its "to-be-expired" counterpart:
                            client.set(expired_ticket, EXPIRED_TICKET);
                            client.expire(expired_ticket, policy.remember_until);
                            
                            reply = {"status": VALID_TICKET, "expires_in": 0, "policy": "requests_based", "next_ticket": newTicket};
                        }
                        
                        
                        res.send(reply);
                    }
                }
                else
                {
                    var reply = {"status": "ERROR", "cause": "different_policy"};
                                    
                    res.status(400).send(reply);
                }
            }
            else
            {
                // Malformed ticket in the DB: delete
                client.del(VALID_PREFIX + ticket_base, function(err)
                {
                    var reply = {"status": "ERROR", "cause": "malformed_ticket"};
                        
                    res.status(500).send(reply);
                });
            }
        });
    });
}

function handleManualTicketResponse(ticket_base, res)
{
    var reply = {"status": VALID_TICKET, "policy": "manual_expiration"};
        
    res.send(reply);
}

function handleCascadingTicketResponse(ticket_base, res)
{
    client.select(REDIS_DB, function()
    {
        client.hget(VALID_PREFIX + ticket_base, "policy", function(err, policy_str)
        {
            if (policy_str)
            {
                var policy = JSON.parse(policy_str);
                
                if (policy.cascading)
                {
                    var dep_ticket = policy.depends_on;
                    
                    if (dep_ticket)
                    {
                        client.exists(VALID_PREFIX + dep_ticket, function(error, exists)
                        {
                            if (exists)
                            {
                                var reply = {"status": VALID_TICKET, "policy": "cascading", "depends_on": dep_ticket};
                                
                                res.send(reply);
                            }
                            else
                            {
                                client.exists(EXPIRED_PREFIX + dep_ticket, function(error, expired)
                                {
                                    /* The ticket this one depends on has expired
                                     * since the last time we checked.
                                     * We must mark this one as expired too. */
                                    
                                    // Early reply
                                    var reply = {"status": EXPIRED_TICKET};
                                    
                                    res.send(reply);
                                    
                                    client.del(VALID_PREFIX + ticket_base);
                                });
                            }
                        });
                    }
                }
            }
        });
    });
}

function handleBandwidthTicketResponse(ticket_base, res)
{
    client.select(REDIS_DB, function()
    {
        client.hget(VALID_PREFIX + ticket_base, "policy", function(err, policy_str)
        {
            if (policy_str)
            {
                var policy = JSON.parse(policy_str);
                
                if (policy.bandwidth_based)
                {
                    var last_check = policy.last_check;
                    
                    console.log("last_check: %s", last_check);
                    
                    var count = policy.checks_count;
                    
                    var now = (new Date()).getTime();
                    
                    console.log("now: %s", now);
                    
                    var timeDiff = now - last_check;
                    
                    console.log("diff (in seconds): %s", timeDiff / 1000);
                    
                    if ( last_check
                         && timeDiff < 60 * 1000 )
                    {
                        if (count >= policy.expires_in)
                        {
                            // Expired ticket
                            var reply = {"status": EXPIRED_TICKET};
                            
                            res.send(reply);
                        }
                        else
                        {
                            var reply = {
                                "status": VALID_TICKET,
                                "expires_in": policy.expires_in - count,
                                "policy": "bandwidth_based"
                            };
                            
                            res.send(reply);
                        }
                        
                        count++;
                    }
                    else
                    {
                        /* First time this ticket has been checked
                         * or a minute from the last check has already passed */
                        
                        count = 1;
                        
                        var reply = {
                            "status": VALID_TICKET,
                            "expires_in": policy.expires_in - count,
                            "policy": "bandwidth_based"
                        };
                        
                        res.send(reply);
                        
                        policy.last_check = now;
                    }
                    
                    
                    policy.checks_count = count;
                    
                    client.hset(VALID_PREFIX + ticket_base, "policy", JSON.stringify(policy));
                }
                else
                {
                    var reply = {"status": "ERROR", "cause": "different_policy"};
                                    
                    res.status(400).send(reply);
                }
            }
            else
            {
                // Malformed ticket in the DB: delete
                client.del(VALID_PREFIX + ticket_base, function(err)
                {
                    var reply = {"status": "ERROR", "cause": "malformed_ticket"};
                        
                    res.status(500).send(reply);
                });
            }
        });
    });
}


exports.new = function(req, res)
{
    client.select(REDIS_DB, function()
    {
        calculateExpirationPolicy(req.query, function(policy)
        {
            if (policy)
            {
                var count = 1;
            
                if (req.query.count)
                {
                    count = req.query.count;
                }
                
                if (count > MAX_TICKETS_PER_TIME)
                {
                    var reply = {
                        "result": "NOT_OK",
                        "cause": "too_much_tickets",
                        "message": "Try lowering your 'count' request to <" + MAX_TICKETS_PER_TIME
                    };
                    
                    res.status(400).send(reply);
                }
                else
                {
                    var tickets = new Array();
                    
                    var reply = {"result": "OK",
                        "tickets": undefined,
                        "expire_in": policy.expires_in,
                        "policy": undefined
                    };
                    
                    for (var a=0; a<count; a++)
                    {
                        var ticket_base = createNewTicket();
                        var valid_ticket   = VALID_PREFIX   + ticket_base;
                        var expired_ticket = EXPIRED_PREFIX + ticket_base;
                        
                        if (policy.time_based)
                        {
                            if (count == 1)
                            {
                                // Early reply:
                                var reply = {"result": "OK", "ticket": ticket_base, "expires_in": policy.expires_in, "policy": "time_based"};
                                res.send(reply);
                            }
                            else
                            {
                                reply.policy = "time_based";
                                tickets[a] = ticket_base;
                            }
                            
                            // First save the "real" ticket:
                            client.hset(valid_ticket, "content", VALID_TICKET);
                            client.hset(valid_ticket, "policy", JSON.stringify(policy));
                            client.expire(valid_ticket, policy.expires_in);
                            
                            // Then save the "to-be-expired" counterpart:
                            client.set(expired_ticket, EXPIRED_TICKET);
                            client.expire(expired_ticket, policy.remember_until);
                        }
                        else if (policy.requests_based)
                        {
                            if (count == 1)
                            {
                                // Early reply:
                                var reply = {"result": "OK", "ticket": ticket_base, "expires_in": policy.expires_in, "policy": "requests_based"};
                                res.send(reply);
                            }
                            else
                            {
                                reply.policy = "requests_based";
                                tickets[a] = ticket_base;
                            }
                            
                            // First save the "real" ticket:
                            client.hset(valid_ticket, "content", VALID_TICKET);
                            client.hset(valid_ticket, "policy", JSON.stringify(policy));
                            
                            // Then save the "to-be-expired" counterpart:
                            client.set(expired_ticket, EXPIRED_TICKET);
                            client.expire(expired_ticket, policy.remember_until);
                        }
                        else if (policy.manual_expiration)
                        {
                            if (count == 1)
                            {
                                // Early reply:
                                var reply = {"result": "OK", "ticket": ticket_base, "policy": "manual_expiration"};
                                res.send(reply);
                            }
                            else
                            {
                                reply.policy = "manual_expiration";
                                tickets[a] = ticket_base;
                            }
                            
                            // Just save the ticket:
                            client.hset(valid_ticket, "content", VALID_TICKET);
                            client.hset(valid_ticket, "policy", JSON.stringify(policy));
                        }
                        else if (policy.cascading)
                        {
                            if (count == 1)
                            {
                                // Early reply:
                                var reply = {"result": "OK", "ticket": ticket_base, "depends_on": policy.depends_on, "policy": "cascading"};
                                res.send(reply);
                            }
                            else
                            {
                                reply.policy = "cascading";
                                tickets[a] = ticket_base;
                            }
                            
                            // First save the "real" ticket:
                            client.hset(valid_ticket, "content", VALID_TICKET);
                            client.hset(valid_ticket, "policy", JSON.stringify(policy));
                            
                            // Then save the "to-be-expired" counterpart:
                            client.set(expired_ticket, EXPIRED_TICKET);
                            client.expire(expired_ticket, policy.remember_until);
                        }
                        else if (policy.bandwidth_based)
                        {
                            if (count == 1)
                            {
                                // Early reply:
                                var reply = {"result": "OK", "ticket": ticket_base, "policy": "bandwidth_based", "requests_per_minute": policy.expires_in};
                                res.send(reply);
                            }
                            else
                            {
                                reply.policy = "bandwidth_based";
                                tickets[a] = ticket_base;
                            }
                            
                            // Save the ticket WITHOUT the last-check time:
                            client.hset(valid_ticket, "content", VALID_TICKET);
                            client.hset(valid_ticket, "policy", JSON.stringify(policy));
                            
                            // No "to-be-expired" counterpart: bandwidth-based tickets never expire
                        }
                        else
                        {
                            // Return an error:
                            var reply = {"result": "NOT_OK", "cause": "wrong_policy"};
                            
                            if (count == 1)
                            {
                                res.status(400).send(reply);
                            }
                            else
                            {
                                // Exit from the external "for":
                                break;
                            }
                        }
                    }
                    
                    if (count > 1)
                    {
                        if (reply.status != "NOT_OK")
                        {
                            reply.tickets = tickets;
                        }
                        
                        res.send(reply);
                    }
                }
            }
            else
            {
                // Return an error:
                var reply = {"result": "NOT_OK", "cause": "wrong_policy"};
                
                res.status(400).send(reply);
            }
        });
    });
};

exports.status = function(req, res)
{
    client.select(REDIS_DB, function()
    {
        var ticket_base = req.param("ticket");
        
        if (ticket_base)
        {
            global.log.debug("[tickets.status] asking status of ticket '%s'...'", ticket_base);
            
            client.exists(VALID_PREFIX + ticket_base, function(error, exists)
            {
                global.log.debug("[tickets.status] exists returned: %s", exists);
                global.log.debug("[tickets.status] error was: %s", error);
                
                if (exists)
                {
                    var policy_str = client.hget(VALID_PREFIX + ticket_base, "policy", function(err, policy_str)
                    {
                        if (policy_str)
                        {
                            global.log.debug("[tickets.status] policy string is %s", policy_str);
                            
                            var policy = JSON.parse(policy_str);
                            
                            var can_go_on = true;
                            
                            // If the tickets was created with a context check it:
                            if (policy.context)
                            if (req.query.context != policy.context)
                            {
                                can_go_on = false;
                            }
                            
                            if (can_go_on)
                            {
                                if (policy.time_based)
                                {
                                    handleTimeBasedTicketResponse(ticket_base, res);
                                }
                                else if (policy.requests_based)
                                {
                                    handleRequestsBasedTicketResponse(ticket_base, res);
                                }
                                else if (policy.manual_expiration)
                                {
                                    handleManualTicketResponse(ticket_base, res);
                                }
                                else if (policy.cascading)
                                {
                                    handleCascadingTicketResponse(ticket_base, res);
                                }
                                else if (policy.bandwidth_based)
                                {
                                    handleBandwidthTicketResponse(ticket_base, res);
                                }
                            }
                            else
                            {
                                var reply = {"status": "ERROR", "cause": "not_found"};
                                
                                res.status(404).send(reply);
                            }
                        }
                        else
                        {
                            // Malformed ticket in the DB: delete
                            client.del(VALID_PREFIX + ticket_base, function(err)
                            {
                                var reply = {"status": "ERROR", "cause": "malformed_ticket"};
                                    
                                res.status(500).send(reply);
                            });
                        }
                    });
                }
                else
                {
                    // Check whether it expired:
                    client.exists(EXPIRED_PREFIX + ticket_base, function(error, expired)
                    {
                        global.log.debug("[tickets.status] expired returned: %s", expired);
                        global.log.debug("[tickets.status] error was: %s", error);
                        
                        if (expired)
                        {
                            var reply = {"status": EXPIRED_TICKET};
                            
                            res.send(reply);
                        }
                        else
                        {
                            var reply = {"status": "ERROR", "cause": "not_found"};
                            
                            res.status(404).send(reply);
                        }
                    });
                }
            });
        }
        else
        {
            var reply = {"status": "ERROR", "cause": "empty_request"};
            
            res.status(400).send(reply);
        }
        
    });
};

exports.expire = function(req, res)
{
    client.select(REDIS_DB, function()
    {
        var ticket_base = req.param("ticket");
        
        if (ticket_base)
        {
            client.exists(VALID_PREFIX + ticket_base, function(error, exists)
            {
                if (exists)
                {
                    client.hget(VALID_PREFIX + ticket_base, "policy", function(error, policy_str)
                    {
                        if (policy_str)
                        {
                            var policy = JSON.parse(policy_str);
                            
                            if (policy.manual_expiration === true
                                || policy.can_force_expiration === true)
                            {
                                var reply = {"status": EXPIRED_TICKET};
                                    
                                res.send(reply);
                                
                                // Save the "expired" counterpart when manually expiring:
                                client.set(EXPIRED_PREFIX + ticket_base, EXPIRED_TICKET);
                                client.expire(EXPIRED_PREFIX + ticket_base, policy.remember_until);
                                
                                // Finally delete valid ticket
                                client.del(VALID_PREFIX + ticket_base);
                            }
                            else
                            {
                                var reply = {"status": "ERROR", "cause": "different_policy"};
                                    
                                res.status(400).send(reply);
                            }
                        }
                        else
                        {
                            // Malformed ticket in the DB: delete
                            client.del(VALID_PREFIX + ticket_base, function(err)
                            {
                                var reply = {"status": "ERROR", "cause": "malformed_ticket"};
                                    
                                res.status(500).send(reply);
                            });
                        }
                    });
                }
                else
                {
                    // Check whether it expired:
                    client.exists(EXPIRED_PREFIX + ticket_base, function(error, expired)
                    {
                        global.log.debug("[tickets.expire] expired returned: %s", expired);
                        global.log.debug("[tickets.expire] error was: %s", error);
                        
                        if (expired)
                        {
                            var reply = {"status": "ERROR", "cause": "ticket_already_expired"};
                            
                            res.status(400).send(reply);
                        }
                        else
                        {
                            var reply = {"status": "ERROR", "cause": "not_found"};
                            
                            res.status(404).send(reply);
                        }
                    });
                }
            });
        }
        else
        {
            var reply = {"status": "ERROR", "cause": "empty_request"};
            
            res.status(400).send(reply);
        }
    });
};

