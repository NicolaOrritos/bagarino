
'use strict';

// [todo] - Add a clarification about bandwidth-based tickets: they never expire, they simply can be spent a fixed amount of times within a minute
// [todo] - Add new docs for auto-renewable tickets
// [todo] - Add new docs for can_force_expiration switch
// [todo] - What happens to a requests-based 10-requests-long ticket expired counterpart after DEFAULT_REMEMBER_UNTIL if I didn't ask for it never once?

var P        = require('bluebird');
var hash     = require('node_hash');
var redis    = require('redis');
var Hashids  = require('hashids');
var CONF     = require('./conf');
var CONST    = require('./const');
var policies = require('./policies');

var lighthash = new Hashids('bagarino');


var client = redis.createClient();

client.on('error', function (err)
{
    global.log.error('Got an error from the Redis client: ' + err);
});

var REDIS_DB = CONST.DB;


// [todo] - Add bandwidth-based policy
function calculateExpirationPolicy(query_string)
{
    return new P(function(resolve, reject)
    {
        if (query_string)
        {
            var alreadyRejected = false;

            var policy =
            {
                // Policies available for tickets:
                time_based: false,
                requests_based: false,
                manual_expiration: false,
                cascading: false,
                bandwidth_based: false,

                // When the ticket has a cascading policy this field tracks the one it depends on:
                depends_on: undefined,

                // Track an optional context for this ticket
                context: undefined,

                // Auto-renewable ticket?
                autorenew: false,

                // Can expiration be forced?
                can_force_expiration: false,

                // Generation speed:
                generation_speed: CONST.SPEED.SLOW,

                // Parameter-driven max age for a 'valid' ticket, despite its policy:
                last_max: undefined,

                // Number of seconds/requests until this ticket expires
                expires_in: undefined,

                // How much time before discarding the 'expired' countepart
                remember_until: CONF.SECONDS_TO_REMEMBER_TICKETS_UNTIL || CONST.DEFAULT_REMEMBER_UNTIL
            };


            // The policy may contain a "context":
            if (query_string.context)
            {
                policy.context = query_string.context;
            }

            if (query_string.autorenew)
            {
                policy.autorenew = (query_string.autorenew === true || query_string.autorenew === 'true');
            }

            if (query_string.can_force_expiration)
            {
                policy.can_force_expiration = (query_string.can_force_expiration === true || query_string.can_force_expiration === 'true');
            }

            if (query_string.generation_speed)
            {
                var speed = query_string.generation_speed.trim ? query_string.generation_speed.trim().toLowerCase() : CONST.SPEED.SLOW;

                if (speed === CONST.SPEED.FAST)
                {
                    policy.generation_speed = CONST.SPEED.FAST;
                }
                else if (speed === CONST.SPEED.FASTER)
                {
                    policy.generation_speed = CONST.SPEED.FASTER;
                }
                else
                {
                    policy.generation_speed = CONST.SPEED.SLOW;
                }

                global.log.debug('Creating ticket with generation speed "%s"...', policy.generation_speed);
            }

            if (query_string.last_max)
            {
                var last_max = parseInt(query_string.last_max);

                if (isNaN(last_max) || last_max <= 0)
                {
                    alreadyRejected = true;

                    reject(new Error('When provided, "last_max" parameter must be a positive integer, greater than 0'));
                }
                else
                {
                    policy.last_max = last_max;
                }
            }

            if (alreadyRejected)
            {
                // Skip everything below...
            }
            else if (query_string.policy === CONST.POLICIES.REQUESTS_BASED)
            {
                policies.detectRequestsBased(query_string, policy)
                .then(function(newPolicy)
                {
                    resolve(newPolicy);
                })
                .catch(function(err)
                {
                    reject(err);
                });
            }
            else if (query_string.policy === CONST.POLICIES.MANUAL_EXPIRATION)
            {
                policies.detectManual(query_string, policy)
                .then(function(newPolicy)
                {
                    resolve(newPolicy);
                })
                .catch(function(err)
                {
                    reject(err);
                });
            }
            else if (query_string.policy === CONST.POLICIES.TIME_BASED)
            {
                policies.detectTimeBased(query_string, policy)
                .then(function(newPolicy)
                {
                    resolve(newPolicy);
                })
                .catch(function(err)
                {
                    reject(err);
                });
            }
            else if (query_string.policy === CONST.POLICIES.CASCADING)
            {
                policies.detectCascading(query_string, policy)
                .then(function(newPolicy)
                {
                    resolve(newPolicy);
                })
                .catch(function(err)
                {
                    reject(err);
                });
            }
            else if (query_string.policy === CONST.POLICIES.BANDWIDTH_BASED)
            {
                policies.detectBandwithBased(query_string, policy)
                .then(function(newPolicy)
                {
                    resolve(newPolicy);
                })
                .catch(function(err)
                {
                    reject(err);
                });
            }
            else
            {
                policy = undefined;

                resolve(policy);
            }
        }
        else
        {
            // Call the save_ticket function passing undefined:
            reject();
        }
    });
}

function createNewTicket_faster()
{
    var ticket = (new Date()).getTime().toString();
    return ticket;
}

function createNewTicket_fast()
{
    var now = (new Date()).getTime();

    var ticket = lighthash.encode(now);

    return ticket;
}

function createNewTicket_slow()
{
    var now = (new Date()).getTime().toString();

    now += Math.random();

    var ticket = hash.sha1(now);

    return ticket;
}

function createNewTicket(speed)
{
    if (speed === CONST.SPEED.FASTER)
    {
        return createNewTicket_faster();
    }
    else if (speed === CONST.SPEED.FAST)
    {
        return createNewTicket_fast();
    }
    else
    {
        return createNewTicket_slow();
    }
}

function isAutorenewable(policy)
{
    var result = false;

    if (policy)
    {
        result = (policy.autorenew === true || policy.autorenew === 'true');
    }

    return result;
}

function handleTimeBasedTicketResponse(ticket_base, res, next)
{
    client.select(REDIS_DB, function()
    {
        client.ttl(CONST.VALID_PREFIX + ticket_base, function(err, ttl)
        {
            var reply = {'status': CONST.ERROR};

            if (err)
            {
                reply.cause = err;

                res.send(500, reply);
            }
            else
            {
                reply.status = CONST.VALID_TICKET;
                reply.expires_in = ttl;
                reply.policy = CONST.POLICIES.TIME_BASED;

                res.send(reply);
            }

            next();
        });
    });
}

function handleRequestsBasedTicketResponse(ticket_base, res, next)
{
    client.select(REDIS_DB, function()
    {
        client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', function(err, policy_str)
        {
            var reply = {'status': CONST.ERROR};

            if (policy_str)
            {
                var policy = JSON.parse(policy_str);

                if (policy.requests_based)
                {
                    if (policy.expires_in === 0)
                    {
                        reply.status = CONST.EXPIRED_TICKET;

                        res.send(reply);

                        client.del(CONST.VALID_PREFIX + ticket_base);

                        // Begin the expiration countdown for the "expired" counterpart:
                        client.expire(CONST.EXPIRED_PREFIX + ticket_base, policy.remember_until);
                    }
                    else
                    {
                        policy.expires_in -= 1;

                        client.hset(CONST.VALID_PREFIX + ticket_base, 'policy', JSON.stringify(policy));

                        reply.status = CONST.VALID_TICKET;
                        reply.expires_in = policy.expires_in;
                        reply.policy = CONST.POLICIES.REQUESTS_BASED;

                        if (   isAutorenewable(policy)
                            && (policy.expires_in === 0 || policy.expires_in === '0'))
                        {
                            // Create a new ticket and serve it alongside the other info
                            var newTicket = createNewTicket(policy.generation_speed);
                            var valid_ticket   = CONST.VALID_PREFIX   + newTicket;
                            var expired_ticket = CONST.EXPIRED_PREFIX + newTicket;

                            var newPolicy = policy;
                            newPolicy.expires_in = newPolicy.original_expires_in = policy.original_expires_in;

                            // First save the "next" ticket:
                            client.hset(valid_ticket, 'content', CONST.VALID_TICKET);
                            client.hset(valid_ticket, 'policy', JSON.stringify(newPolicy));

                            // Then save its "to-be-expired" counterpart, but without the expiration date set on it:
                            client.set(expired_ticket, CONST.EXPIRED_TICKET);

                            reply.expires_in = 0;
                            reply.next_ticket = newTicket;
                        }


                        res.send(reply);

                        next();
                    }
                }
                else
                {
                    reply.status = CONST.ERROR;
                    reply.cause  = CONST.ERRORS.DIFFERENT_POLICY;

                    res.send(400, reply);

                    next();
                }
            }
            else
            {
                // Malformed ticket in the DB: delete
                client.del(CONST.VALID_PREFIX + ticket_base, function(err)
                {
                    if (err)
                    {
                        reply.cause = err;
                    }
                    else
                    {
                        reply.cause = CONST.ERRORS.MALFORMED_TICKET;
                    }

                    res.send(500, reply);

                    next();
                });
            }
        });
    });
}

function handleManualTicketResponse(ticket_base, res, next)
{
    var reply = {'status': CONST.VALID_TICKET, 'policy': CONST.POLICIES.MANUAL_EXPIRATION};

    res.send(reply);

    next();
}

function handleCascadingTicketResponse(ticket_base, res, next)
{
    client.select(REDIS_DB, function()
    {
        client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', function(err, policy_str)
        {
            if (policy_str)
            {
                var policy = JSON.parse(policy_str);

                if (policy.cascading)
                {
                    var dep_ticket = policy.depends_on;

                    if (dep_ticket)
                    {
                        client.exists(CONST.VALID_PREFIX + dep_ticket, function(error, exists)
                        {
                            var reply = {'status': CONST.ERROR};

                            if (error)
                            {
                                reply.cause = error;

                                res.send(reply);
                            }
                            else if (exists)
                            {
                                reply.status = CONST.VALID_TICKET;
                                reply.policy = CONST.POLICIES.CASCADING;
                                reply.depends_on = dep_ticket;

                                res.send(reply);

                                next();
                            }
                            else
                            {
                                client.exists(CONST.EXPIRED_PREFIX + dep_ticket, function(error2)
                                {
                                    if (error2)
                                    {
                                        reply.cause = error2;
                                        res.send(500, reply);
                                    }
                                    else
                                    {
                                        /* The ticket this one depends on has expired
                                         * since the last time we checked.
                                         * We must mark this one as expired too. */

                                        // Early reply
                                        reply.status = CONST.EXPIRED_TICKET;

                                        res.send(reply);

                                        client.del(CONST.VALID_PREFIX + ticket_base);

                                        // Begin the expiration countdown for the "expired" counterpart:
                                        client.expire(CONST.EXPIRED_PREFIX + ticket_base, policy.remember_until);
                                    }

                                    next();
                                });
                            }
                        });
                    }
                }
            }
        });
    });
}

function handleBandwidthTicketResponse(ticket_base, res, next)
{
    client.select(REDIS_DB, function()
    {
        client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', function(err, policy_str)
        {
            var reply = {'status': CONST.ERROR};

            if (policy_str)
            {
                var policy = JSON.parse(policy_str);

                if (policy.bandwidth_based)
                {
                    var last_check = policy.last_check;

                    console.log('last_check: %s', last_check);

                    var count = policy.checks_count;
                    var now = (new Date()).getTime();
                    var timeDiff = now - last_check;

                    console.log('diff (in seconds): %s', timeDiff / 1000);


                    if (   last_check
                        && timeDiff < 60 * 1000 )  // 60 seconds
                    {
                        if (count < policy.expires_in)
                        {
                            reply.status = CONST.VALID_TICKET;
                            reply.expires_in = policy.expires_in - count;
                            reply.policy = CONST.POLICIES.BANDWIDTH_BASED;
                        }
                        else
                        {
                            reply.status = CONST.EXPIRED_TICKET;
                        }

                        count++;
                    }
                    else
                    {
                        /* First time this ticket has been checked
                         * or a minute from the last check has already passed */

                        count = 1;

                        reply.status = CONST.VALID_TICKET;
                        reply.expires_in = policy.expires_in - count;
                        reply.policy = CONST.POLICIES.BANDWIDTH_BASED;

                        policy.last_check = now;
                    }

                    res.send(reply);


                    policy.checks_count = count;

                    client.hset(CONST.VALID_PREFIX + ticket_base, 'policy', JSON.stringify(policy));
                }
                else
                {
                    reply.cause = CONST.ERRORS.DIFFERENT_POLICY;

                    res.send(400, reply);
                }
            }
            else
            {
                // Malformed ticket in the DB: early-reply and delete
                reply.cause = CONST.ERRORS.MALFORMED_TICKET;

                res.send(500, reply);

                client.del(CONST.VALID_PREFIX + ticket_base, function(err)
                {
                    console.log('Could not delete supposedly-malformed ticket "%s". Cause: %s', ticket_base, err);
                });
            }

            next();
        });
    });
}

function addToContextMap(context, ticket)
{
    if (context && ticket)
    {
        context = CONST.CONTEXTS_PREFIX + context;

        client.select(REDIS_DB, function()
        {
            client.lpush(context, ticket, function(err)
            {
                if (err)
                {
                    console.log('Could not save "%s" to context "%s"', ticket, context);
                }
            });
        });
    }
}


exports.new = function(req, res, next)
{
    client.select(REDIS_DB, function()
    {
        var reply = {'result': CONST.NOT_OK};

        calculateExpirationPolicy(req.query)
        .then(function(policy)
        {
            var count = 1;

            if (req.query.count)
            {
                count = req.query.count;
            }

            if (count > CONST.MAX_TICKETS_PER_TIME)
            {
                reply.cause = CONST.ERRORS.TOO_MUCH_TICKETS;
                reply.message = 'Try lowering your "count" request to <' + CONST.MAX_TICKETS_PER_TIME;

                res.send(400, reply);
            }
            else
            {
                var tickets = [];

                reply.result = CONST.OK;
                reply.expires_in = policy.expires_in;

                for (var a=0; a<count; a++)
                {
                    var ticket_base = createNewTicket(policy.generation_speed);
                    var valid_ticket   = CONST.VALID_PREFIX   + ticket_base;
                    var expired_ticket = CONST.EXPIRED_PREFIX + ticket_base;

                    if (policy.time_based)
                    {
                        if (count === 1)
                        {
                            // Early reply:
                            reply.ticket = ticket_base;
                            reply.policy = CONST.POLICIES.TIME_BASED;

                            res.send(reply);
                        }
                        else
                        {
                            reply.policy = CONST.POLICIES.TIME_BASED;
                            tickets[a] = ticket_base;
                        }

                        // Adjust 'remember_until' to be meaningful in respect to 'expires_in':
                        if (policy.remember_until <= policy.expires_in)
                        {
                            policy.remember_until += policy.expires_in;
                        }

                        // First save the "real" ticket:
                        client.hset(valid_ticket, 'content', CONST.VALID_TICKET);
                        client.hset(valid_ticket, 'policy', JSON.stringify(policy));
                        client.expire(valid_ticket, policy.expires_in);

                        // Then save the "to-be-expired" counterpart:
                        client.set(expired_ticket, CONST.EXPIRED_TICKET);
                        client.expire(expired_ticket, policy.remember_until);


                        if (policy.context)
                        {
                            addToContextMap(policy.context, ticket_base);
                        }
                    }
                    else if (policy.requests_based)
                    {
                        if (count === 1)
                        {
                            // Early reply:
                            reply.ticket = ticket_base;
                            reply.policy = CONST.POLICIES.REQUESTS_BASED;

                            res.send(reply);
                        }
                        else
                        {
                            reply.policy = CONST.POLICIES.REQUESTS_BASED;
                            tickets[a] = ticket_base;
                        }

                        // First save the "real" ticket:
                        client.hset(valid_ticket, 'content', CONST.VALID_TICKET);
                        client.hset(valid_ticket, 'policy', JSON.stringify(policy));

                        // Then save the "to-be-expired" counterpart, but without the expiration condition applied to it:
                        client.set(expired_ticket, CONST.EXPIRED_TICKET);


                        if (policy.context)
                        {
                            addToContextMap(policy.context, ticket_base);
                        }
                    }
                    else if (policy.manual_expiration)
                    {
                        if (count === 1)
                        {
                            // Early reply:
                            reply.ticket = ticket_base;
                            reply.policy = CONST.POLICIES.MANUAL_EXPIRATION;

                            res.send(reply);
                        }
                        else
                        {
                            reply.policy = CONST.POLICIES.MANUAL_EXPIRATION;
                            tickets[a] = ticket_base;
                        }

                        // First save the "real" ticket:
                        client.hset(valid_ticket, 'content', CONST.VALID_TICKET);
                        client.hset(valid_ticket, 'policy', JSON.stringify(policy));

                        // Then save the "to-be-expired" counterpart, but without the expiration condition applied to it:
                        client.set(expired_ticket, CONST.EXPIRED_TICKET);


                        if (policy.context)
                        {
                            addToContextMap(policy.context, ticket_base);
                        }
                    }
                    else if (policy.cascading)
                    {
                        if (count === 1)
                        {
                            // Early reply:
                            reply.ticket = ticket_base;
                            reply.depends_on = policy.depends_on;
                            reply.policy = CONST.POLICIES.CASCADING;

                            res.send(reply);
                        }
                        else
                        {
                            reply.policy = CONST.POLICIES.CASCADING;
                            tickets[a] = ticket_base;
                        }

                        // First save the "real" ticket:
                        client.hset(valid_ticket, 'content', CONST.VALID_TICKET);
                        client.hset(valid_ticket, 'policy', JSON.stringify(policy));

                        // Then save the "to-be-expired" counterpart, but without the expiration condition applied to it:
                        client.set(expired_ticket, CONST.EXPIRED_TICKET);


                        if (policy.context)
                        {
                            addToContextMap(policy.context, ticket_base);
                        }
                    }
                    else if (policy.bandwidth_based)
                    {
                        if (count === 1)
                        {
                            // Early reply:
                            reply.ticket = ticket_base;
                            reply.policy = CONST.POLICIES.BANDWIDTH_BASED;
                            reply.requests_per_minute = policy.expires_in;

                            res.send(reply);
                        }
                        else
                        {
                            reply.policy = CONST.POLICIES.BANDWIDTH_BASED;
                            tickets[a] = ticket_base;
                        }

                        // Save the ticket WITHOUT the last-check time:
                        client.hset(valid_ticket, 'content', CONST.VALID_TICKET);
                        client.hset(valid_ticket, 'policy', JSON.stringify(policy));

                        // No "to-be-expired" counterpart: bandwidth-based tickets never expire


                        if (policy.context)
                        {
                            addToContextMap(policy.context, ticket_base);
                        }
                    }
                    else
                    {
                        // Return an error:
                        delete reply.expires_in;
                        reply.result = CONST.NOT_OK;
                        reply.cause = CONST.ERRORS.WRONG_POLICY;

                        if (count === 1)
                        {
                            res.send(400, reply);
                        }
                        else
                        {
                            // Exit from the external "for":
                            break;
                        }
                    }

                    if (policy.last_max)
                    {
                        if (policy.time_based)
                        {
                            policy.last_max = Math.max(policy.expires_in, policy.last_max);
                        }

                        if (policy.remember_until <= policy.last_max)
                        {
                            policy.remember_until += policy.last_max;
                        }

                        console.log('Ticket will last max "%s"', policy.last_max);

                        // Set expiration for the 'valid' counterpart:
                        client.expire(CONST.VALID_PREFIX + ticket_base, policy.last_max);

                        // We know expiration time for sure, hence already prepare the 'expired' counterpart:
                        client.set(CONST.EXPIRED_PREFIX + ticket_base, CONST.EXPIRED_TICKET);
                        client.expire(CONST.EXPIRED_PREFIX + ticket_base, policy.remember_until);
                    }
                }

                if (count > 1)
                {
                    if (reply.result !== CONST.NOT_OK)
                    {
                        reply.tickets = tickets;
                    }

                    res.send(reply);
                }

                return next();
            }
        })
        .catch(function()
        {
            // Return an error:
            reply.cause = CONST.ERRORS.WRONG_POLICY;

            res.send(400, reply);

            return next();
        });
    });
};

exports.status = function(req, res, next)
{
    client.select(REDIS_DB, function()
    {
        var reply = {'status': CONST.ERROR};

        var ticket_base = req.params.ticket;

        if (ticket_base)
        {
            global.log.debug('[tickets.status] asking status of ticket "%s"...', ticket_base);

            client.exists(CONST.VALID_PREFIX + ticket_base, function(error, exists)
            {
                global.log.debug('[tickets.status] exists returned: %s', exists);
                global.log.debug('[tickets.status] error was: %s', error);

                if (exists)
                {
                    client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', function(err, policy_str)
                    {
                        if (policy_str)
                        {
                            global.log.debug('[tickets.status] policy string is %s', policy_str);

                            var policy = JSON.parse(policy_str);

                            var can_go_on = true;

                            // If the ticket was created with a context check it:
                            if (   policy.context
                                && req.query.context !== policy.context)
                            {
                                can_go_on = false;
                            }

                            if (can_go_on)
                            {
                                if (policy.time_based)
                                {
                                    handleTimeBasedTicketResponse(ticket_base, res, next);
                                }
                                else if (policy.requests_based)
                                {
                                    handleRequestsBasedTicketResponse(ticket_base, res, next);
                                }
                                else if (policy.manual_expiration)
                                {
                                    handleManualTicketResponse(ticket_base, res, next);
                                }
                                else if (policy.cascading)
                                {
                                    handleCascadingTicketResponse(ticket_base, res, next);
                                }
                                else if (policy.bandwidth_based)
                                {
                                    handleBandwidthTicketResponse(ticket_base, res, next);
                                }


                                // Additionally, rewrite the expire counterpart of the ticket everytime we find a valid one [to avoid issue #8]
                                client.set(CONST.EXPIRED_PREFIX + ticket_base, CONST.EXPIRED_TICKET);
                            }
                            else
                            {
                                reply.cause = CONST.ERRORS.NOT_FOUND;

                                res.send(404, reply);

                                return next();
                            }
                        }
                        else
                        {
                            // Malformed ticket in the DB: early-reply and delete
                            reply.cause = CONST.ERRORS.MALFORMED_TICKET;

                            res.send(500, reply);

                            next();

                            client.del(CONST.VALID_PREFIX + ticket_base, function(err)
                            {
                                console.log('Could not delete supposedly-malformed ticket "%s". Cause: %s', ticket_base, err);
                            });
                        }
                    });
                }
                else
                {
                    // Check whether it expired:
                    client.exists(CONST.EXPIRED_PREFIX + ticket_base, function(error, expired)
                    {
                        global.log.debug('[tickets.status] expired returned: %s', expired);
                        global.log.debug('[tickets.status] error was: %s', error);

                        if (expired)
                        {
                            reply.status = CONST.EXPIRED_TICKET;

                            res.send(reply);

                            return next();
                        }
                        else
                        {
                            reply.cause = CONST.ERRORS.NOT_FOUND;

                            res.send(404, reply);

                            return next();
                        }
                    });
                }
            });
        }
        else
        {
            reply.cause = CONST.ERRORS.EMPTY_REQUEST;

            res.send(400, reply);

            return next();
        }
    });
};

exports.expire = function(req, res, next)
{
    client.select(REDIS_DB, function()
    {
        var reply = {'status': CONST.ERROR};

        var ticket_base = req.params.ticket;

        if (ticket_base)
        {
            client.exists(CONST.VALID_PREFIX + ticket_base, function(error, exists)
            {
                if (exists)
                {
                    client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', function(error, policy_str)
                    {
                        if (policy_str)
                        {
                            var policy = JSON.parse(policy_str);

                            if (   policy.manual_expiration    === true
                                || policy.can_force_expiration === true)
                            {
                                reply.status = CONST.EXPIRED_TICKET;

                                res.send(reply);

                                // Set expiration on the "expired" counterpart when manually expiring:
                                client.expire(CONST.EXPIRED_PREFIX + ticket_base, policy.remember_until);

                                // Finally delete valid ticket
                                client.del(CONST.VALID_PREFIX + ticket_base);
                            }
                            else
                            {
                                reply.cause = CONST.ERRORS.DIFFERENT_POLICY;

                                res.send(400, reply);

                                return next();
                            }
                        }
                        else
                        {
                            // Malformed ticket in the DB: early-reply and delete
                            reply.cause = CONST.ERRORS.MALFORMED_TICKET;

                            res.send(500, reply);

                            next();

                            client.del(CONST.VALID_PREFIX + ticket_base, function(err)
                            {
                                console.log('Could not delete supposedly-malformed ticket "%s". Cause: %s', ticket_base, err);
                            });
                        }
                    });
                }
                else
                {
                    // Check whether it expired:
                    client.exists(CONST.EXPIRED_PREFIX + ticket_base, function(error, expired)
                    {
                        global.log.debug('[tickets.expire] expired returned: %s', expired);
                        global.log.debug('[tickets.expire] error was: %s', error);

                        if (expired)
                        {
                            reply.cause = CONST.ERRORS.TICKET_ALREADY_EXPIRED;

                            res.send(400, reply);

                            return next();
                        }
                        else
                        {
                            reply.cause = CONST.ERRORS.NOT_FOUND;

                            res.send(404, reply);

                            return next();
                        }
                    });
                }
            });
        }
        else
        {
            reply.cause = CONST.ERRORS.EMPTY_REQUEST;

            res.send(400, reply);

            return next();
        }
    });
};
