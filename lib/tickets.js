
'use strict';

// [todo] - Add a clarification about bandwidth-based tickets: they never expire, they simply can be spent a fixed amount of times within a minute
// [todo] - Add new docs for auto-renewable tickets
// [todo] - Add new docs for can_force_expiration switch
// [todo] - What happens to a requests-based 10-requests-long ticket expired counterpart after DEFAULT_REMEMBER_UNTIL if I didn't ask for it never once?

const hash      = require('node_hash');
const redis     = require('redis');
const Hashids   = require('hashids');
const CONF      = require('./conf');
const CONST     = require('./const');
const policies  = require('./policies');

const lighthash = new Hashids('bagarino');


const client = redis.createClient({
    host: CONF.REDIS.HOST,
    port: CONF.REDIS.PORT,
    db:   CONF.REDIS.DB
});

client.on('error', err =>
{
    global.log.error('Got an error from the Redis client: ' + err);
});


// [todo] - Add bandwidth-based policy
function calculateExpirationPolicy(req)
{
    return new Promise( (resolve, reject) =>
    {
        if (req && req.query)
        {
            const query_string    = req.query;
            let   alreadyRejected = false;

            let policy =
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

                // Whether it carries a payload or not:
                payload: false,

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
                const speed = query_string.generation_speed.trim ? query_string.generation_speed.trim().toLowerCase() : CONST.SPEED.SLOW;

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
                const last_max = parseInt(query_string.last_max);

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

            if (req.body)
            {
                policy.payload = true;
            }

            if (alreadyRejected)
            {
                // Skip everything below...
            }
            else if (query_string.policy === CONST.POLICIES.REQUESTS_BASED)
            {
                Promise.resolve(policies.detectRequestsBased(query_string, policy))
                .then(resolve)
                .catch(reject);
            }
            else if (query_string.policy === CONST.POLICIES.MANUAL_EXPIRATION)
            {
                Promise.resolve(policies.detectManual(query_string, policy))
                .then(resolve)
                .catch(reject);
            }
            else if (query_string.policy === CONST.POLICIES.TIME_BASED)
            {
                Promise.resolve(policies.detectTimeBased(query_string, policy))
                .then(resolve)
                .catch(reject);
            }
            else if (query_string.policy === CONST.POLICIES.CASCADING)
            {
                Promise.resolve(policies.detectCascading(query_string, policy))
                .then(resolve)
                .catch(reject);
            }
            else if (query_string.policy === CONST.POLICIES.BANDWIDTH_BASED)
            {
                Promise.resolve(policies.detectBandwithBased(query_string, policy))
                .then(resolve)
                .catch(reject);
            }
            else
            {
                policy = undefined;

                resolve(policy);
            }
        }
        else
        {
            reject();
        }
    });
}

function createNewTicket_faster()
{
    const ticket = (new Date()).getTime().toString();
    return ticket;
}

function createNewTicket_fast()
{
    const now = (new Date()).getTime();

    const ticket = lighthash.encode(now);

    return ticket;
}

function createNewTicket_slow()
{
    let now = (new Date()).getTime().toString();

    now += Math.random();

    const ticket = hash.sha1(now);

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
    let result = false;

    if (policy)
    {
        result = (policy.autorenew === true || policy.autorenew === 'true');
    }

    return result;
}

function handleTimeBasedTicketResponse(ticket_base, res, next)
{
    client.ttl(CONST.VALID_PREFIX + ticket_base, (err, ttl) =>
    {
        const reply = {'status': CONST.ERROR};

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
}

function handleRequestsBasedTicketResponse(ticket_base, res, next, light)
{
    client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', (err, policy_str) =>
    {
        const reply = {'status': CONST.ERROR};

        if (policy_str)
        {
            const policy = JSON.parse(policy_str);

            if (policy.requests_based)
            {
                const isLight = (light === true || light === 'true');

                if (policy.expires_in === 0 && !isLight)
                {
                    reply.status = CONST.EXPIRED_TICKET;

                    res.send(reply);

                    client.del(CONST.VALID_PREFIX + ticket_base);

                    // Begin the expiration countdown for the "expired" counterpart:
                    client.expire(CONST.EXPIRED_PREFIX + ticket_base, policy.remember_until);
                }
                else
                {
                    if (!isLight)
                    {
                        policy.expires_in -= 1;

                        client.hset(CONST.VALID_PREFIX + ticket_base, 'policy', JSON.stringify(policy));
                    }

                    reply.status = CONST.VALID_TICKET;
                    reply.expires_in = policy.expires_in;
                    reply.policy = CONST.POLICIES.REQUESTS_BASED;

                    if (   isAutorenewable(policy)
                        && !isLight
                        && (policy.expires_in === 0 || policy.expires_in === '0'))
                    {
                        // Create a new ticket and serve it alongside the other info
                        const newTicket = createNewTicket(policy.generation_speed);
                        const valid_ticket   = CONST.VALID_PREFIX   + newTicket;
                        const expired_ticket = CONST.EXPIRED_PREFIX + newTicket;

                        const newPolicy = policy;
                        newPolicy.expires_in = newPolicy.original_expires_in = policy.original_expires_in;

                        // First save the "next" ticket (named "valid_ticket"):
                        client.hset(valid_ticket, 'content', CONST.VALID_TICKET);
                        client.hset(valid_ticket, 'policy', JSON.stringify(newPolicy));

                        if (policy.payload)
                        {
                            client.hget(CONST.VALID_PREFIX + ticket_base, 'payload', (err, payload) =>
                            {
                                if (payload)
                                {
                                    client.hset(valid_ticket, 'payload', payload);
                                }
                            });
                        }


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
            client.del(CONST.VALID_PREFIX + ticket_base, err =>
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
}

function handleManualTicketResponse(ticket_base, res, next)
{
    const reply = {'status': CONST.VALID_TICKET, 'policy': CONST.POLICIES.MANUAL_EXPIRATION};

    res.send(reply);

    next();
}

function handleCascadingTicketResponse(ticket_base, res, next)
{
    client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', (err, policy_str) =>
    {
        if (policy_str)
        {
            const policy = JSON.parse(policy_str);

            if (policy.cascading)
            {
                const dep_ticket = policy.depends_on;

                if (dep_ticket)
                {
                    client.exists(CONST.VALID_PREFIX + dep_ticket, (err, exists) =>
                    {
                        const reply = {'status': CONST.ERROR};

                        if (err)
                        {
                            reply.cause = err;

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
                            client.exists(CONST.EXPIRED_PREFIX + dep_ticket, (error2) =>
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
}

function handleBandwidthTicketResponse(ticket_base, res, next, light)
{
    client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', (err, policy_str) =>
    {
        const reply = {'status': CONST.ERROR};

        if (policy_str)
        {
            const policy = JSON.parse(policy_str);

            const isLight = light === true || light === 'true';

            if (policy.bandwidth_based)
            {
                // Last time we checked this ticket with "/status":
                const last_check = policy.last_check;

                // Times the ticket has been checked in the last minute:
                let count = policy.checks_count;
                let now = (new Date()).getTime();
                const timeDiff = now - last_check;


                if (   last_check
                    && timeDiff < 60 * 1000 )  // 60 seconds
                {
                    if (count < policy.expires_in || isLight)
                    {
                        if (!isLight)
                        {
                            count++;
                        }

                        reply.status = CONST.VALID_TICKET;
                        reply.expires_in = policy.expires_in - count;
                        reply.policy = CONST.POLICIES.BANDWIDTH_BASED;
                    }
                    else
                    {
                        // Since it's expired reset the counter:
                        count = 0;

                        reply.status = CONST.EXPIRED_TICKET;
                    }
                }
                else
                {
                    /* First time this ticket has been checked
                     * or a minute from the last check has already passed */

                    /* Also, first ticket of the bandwidth-based policy
                     * isn't considered for the "light" option.
                     * Only the ones following it are. */

                    count = 1;

                    reply.status = CONST.VALID_TICKET;
                    reply.expires_in = policy.expires_in - count;
                    reply.policy = CONST.POLICIES.BANDWIDTH_BASED;
                }

                res.send(reply);


                // Update the checks count and the check time on the ticket policy:
                policy.checks_count = count;
                policy.last_check   = now;

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

            client.del(CONST.VALID_PREFIX + ticket_base, err =>
            {
                global.log.error('Could not delete supposedly-malformed ticket "%s". Cause: %s', ticket_base, err);
            });
        }

        next();
    });
}

function addToContextMap(context, ticket)
{
    if (context && ticket)
    {
        context = CONST.CONTEXTS_PREFIX + context;

        client.lpush(context, ticket, err =>
        {
            if (err)
            {
                global.log.error('Could not save "%s" to context "%s"', ticket, context);
            }
        });
    }
}

function getPolicyString(policy)
{
    let result;

    if (policy.requests_based)
    {
        result = CONST.POLICIES.REQUESTS_BASED;
    }
    else if (policy.manual_expiration)
    {
        result = CONST.POLICIES.MANUAL_EXPIRATION;
    }
    else if (policy.time_based)
    {
        result = CONST.POLICIES.TIME_BASED;
    }
    else if (policy.cascading)
    {
        result = CONST.POLICIES.CASCADING;
    }
    else if (policy.bandwidth_based)
    {
        result = CONST.POLICIES.BANDWIDTH_BASED;
    }

    return result;
}


function checkExpired(ticket, res, next, reply)
{
    if (ticket && res && next && reply)
    {
        client.exists(CONST.EXPIRED_PREFIX + ticket, (err, expired) =>
        {
            global.log.debug('[checkExpired] expired returned: %s', expired);
            global.log.debug('[checkExpired] error was: %s', err);

            if (expired)
            {
                reply.status = CONST.EXPIRED_TICKET;

                res.send(reply);

                next();
            }
            else
            {
                reply.cause = CONST.ERRORS.NOT_FOUND;

                res.send(404, reply);

                next();
            }
        });
    }
}


exports.new = function(req, res, next)
{
    const reply = {'result': CONST.NOT_OK};

    calculateExpirationPolicy(req)
    .then( policy =>
    {
        let count = 1;

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
            const tickets = [];

            reply.result = CONST.OK;
            reply.expires_in = policy.expires_in;

            for (let a=0; a<count; a++)
            {
                const ticket_base = createNewTicket(policy.generation_speed);
                const valid_ticket   = CONST.VALID_PREFIX   + ticket_base;
                const expired_ticket = CONST.EXPIRED_PREFIX + ticket_base;

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

                    if (policy.payload)
                    {
                        client.hset(valid_ticket, 'payload', JSON.stringify(req.body));
                    }

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

                    if (policy.payload)
                    {
                        client.hset(valid_ticket, 'payload', JSON.stringify(req.body));
                    }


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

                    if (policy.payload)
                    {
                        client.hset(valid_ticket, 'payload', JSON.stringify(req.body));
                    }


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

                    if (policy.payload)
                    {
                        client.hset(valid_ticket, 'payload', JSON.stringify(req.body));
                    }


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

                    if (policy.payload)
                    {
                        client.hset(valid_ticket, 'payload', JSON.stringify(req.body));
                    }


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

                    global.log.debug('Ticket will last max "%s"', policy.last_max);

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

            next();
        }
    })
    .catch( () =>
    {
        // Return an error:
        reply.cause = CONST.ERRORS.WRONG_POLICY;

        res.send(400, reply);

        next();
    });
};

exports.status = function(req, res, next)
{
    const reply = {'status': CONST.ERROR};

    const ticket_base = req.params.ticket;

    if (ticket_base)
    {
        global.log.debug('[tickets.status] asking status of ticket "%s"...', ticket_base);

        client.exists(CONST.VALID_PREFIX + ticket_base, (err, exists) =>
        {
            global.log.debug('[tickets.status] exists returned: %s', exists);
            global.log.debug('[tickets.status] error was: %s', err);

            if (exists)
            {
                client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', (err, policy_str) =>
                {
                    if (policy_str)
                    {
                        global.log.debug('[tickets.status] policy string is %s', policy_str);

                        const policy = JSON.parse(policy_str);

                        let can_go_on = true;

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
                                handleRequestsBasedTicketResponse(ticket_base, res, next, req.query.light);
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
                                handleBandwidthTicketResponse(ticket_base, res, next, req.query.light);
                            }


                            // Additionally, rewrite the expire counterpart of the ticket everytime we find a valid one [to avoid issue #8]
                            client.set(CONST.EXPIRED_PREFIX + ticket_base, CONST.EXPIRED_TICKET);
                        }
                        else
                        {
                            reply.cause = CONST.ERRORS.NOT_FOUND;

                            res.send(404, reply);

                            next();
                        }
                    }
                    else
                    {
                        // Malformed ticket in the DB: early-reply and delete
                        reply.cause = CONST.ERRORS.MALFORMED_TICKET;

                        res.send(500, reply);

                        next();

                        client.del(CONST.VALID_PREFIX + ticket_base, err =>
                        {
                            global.log.error('Could not delete supposedly-malformed ticket "%s". Cause: %s', ticket_base, err);
                        });
                    }
                });
            }
            else
            {
                // Check whether it expired:
                checkExpired(ticket_base, res, next, reply);
            }
        });
    }
    else
    {
        reply.cause = CONST.ERRORS.EMPTY_REQUEST;

        res.send(400, reply);

        next();
    }
};

exports.policy = function(req, res, next)
{
    const reply = {'status': CONST.ERROR};

    const ticket_base = req.params.ticket;

    if (ticket_base)
    {
        client.exists(CONST.VALID_PREFIX + ticket_base, (err, exists) =>
        {
            if (exists)
            {
                client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', (error, policy_str) =>
                {
                    if (policy_str)
                    {
                        const policy = JSON.parse(policy_str);

                        delete reply.status;

                        reply.policy = getPolicyString(policy);

                        reply.more = {};
                        reply.more.context = policy.context;
                        reply.more.autorenew = policy.autorenew;
                        reply.more.depends_on = policy.depends_on;
                        reply.more.generation_speed = policy.generation_speed;
                        reply.more.can_force_expiration = policy.can_force_expiration;

                        res.send(200, reply);

                        next();
                    }
                    else
                    {
                        // Malformed ticket in the DB: early-reply and delete
                        reply.cause = CONST.ERRORS.MALFORMED_TICKET;

                        res.send(500, reply);

                        next();

                        client.del(CONST.VALID_PREFIX + ticket_base, err =>
                        {
                            global.log.error('Could not delete supposedly-malformed ticket "%s". Cause: %s', ticket_base, err);
                        });
                    }
                });
            }
            else
            {
                // Check whether it expired:
                checkExpired(ticket_base, res, next, reply);
            }
        });
    }
    else
    {
        reply.cause = CONST.ERRORS.EMPTY_REQUEST;

        res.send(400, reply);

        next();
    }
};

exports.expire = function(req, res, next)
{
    const reply = {'status': CONST.ERROR};

    const ticket_base = req.params.ticket;

    if (ticket_base)
    {
        client.exists(CONST.VALID_PREFIX + ticket_base, (err, exists) =>
        {
            if (exists)
            {
                client.hget(CONST.VALID_PREFIX + ticket_base, 'policy', (error, policy_str) =>
                {
                    if (policy_str)
                    {
                        const policy = JSON.parse(policy_str);

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

                            next();
                        }
                    }
                    else
                    {
                        // Malformed ticket in the DB: early-reply and delete
                        reply.cause = CONST.ERRORS.MALFORMED_TICKET;

                        res.send(500, reply);

                        next();

                        client.del(CONST.VALID_PREFIX + ticket_base, err =>
                        {
                            global.log.error('Could not delete supposedly-malformed ticket "%s". Cause: %s', ticket_base, err);
                        });
                    }
                });
            }
            else
            {
                // Check whether it expired:
                checkExpired(ticket_base, res, next, reply);
            }
        });
    }
    else
    {
        reply.cause = CONST.ERRORS.EMPTY_REQUEST;

        res.send(400, reply);

        next();
    }
};

exports.withpayload = function(req, res, next)
{
    // Let's keep count to 1:
    req.query.count = 1;

    // Then redirect to 'new()':
    return exports.new(req, res, next);
};

exports.payload = function(req, res, next)
{
    const reply = {'status': CONST.ERROR};

    const ticket_base = req.params.ticket;

    if (ticket_base)
    {
        global.log.debug('[tickets.payload] asking status of ticket "%s"...', ticket_base);

        client.exists(CONST.VALID_PREFIX + ticket_base, (err, exists) =>
        {
            global.log.debug('[tickets.payload] exists returned: %s', exists);
            global.log.debug('[tickets.payload] error was: %s', err);

            if (err)
            {
                global.log.error('Could not search for ticket "%s". %s', ticket_base, err);

                reply.cause = CONST.ERRORS.PAYLOAD_NOT_FOUND;

                res.send(404, reply);

                next();
            }
            else if (exists)
            {
                client.hget(CONST.VALID_PREFIX + ticket_base, 'payload', (err, payload) =>
                {
                    if (err)
                    {
                        global.log.error('Could not load payload for ticket "%s". %s', ticket_base, err);

                        reply.cause = CONST.ERRORS.PAYLOAD_NOT_FOUND;

                        res.send(404, reply);

                        next();
                    }
                    else
                    {
                        let result = {};

                        if (payload)
                        {
                            result = JSON.parse(payload);
                        }

                        res.send(result);

                        next();
                    }
                });
            }
            else
            {
                // Check whether it expired:
                checkExpired(ticket_base, res, next, reply);
            }
        });
    }
    else
    {
        reply.cause = CONST.ERRORS.EMPTY_REQUEST;

        res.send(400, reply);

        next();
    }
};
