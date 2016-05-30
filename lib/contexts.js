
// [todo] - Add documentation for contexts-based multi-ticket expiration

'use strict';

const redis = require('redis');
const CONST = require('./const');
const CONF  = require('./conf');


const client = redis.createClient({
    host: CONF.REDIS.HOST,
    port: CONF.REDIS.PORT,
    db:   CONF.REDIS.DB
});

client.on('error', err =>
{
    global.log.error('Got an error from the Redis client: ' + err.stack);
});


function removeTicket(context, ticket)
{
    return new Promise( (resolve, reject) =>
    {
        if (ticket && context)
        {
            client.hget(CONST.VALID_PREFIX + ticket, 'policy', (error, policy_str) =>
            {
                if (policy_str)
                {
                    const policy = JSON.parse(policy_str);

                    if (   policy.manual_expiration === true
                        || policy.can_force_expiration === true)
                    {
                        // Save the 'expired' counterpart when manually expiring:
                        client.set(CONST.EXPIRED_PREFIX + ticket, CONST.EXPIRED_TICKET);
                        client.expire(CONST.EXPIRED_PREFIX + ticket, policy.remember_until);

                        // Finally delete valid ticket
                        client.del(CONST.VALID_PREFIX + ticket);

                        client.lrem(context, '1', ticket, (err, removed) =>
                        {
                            if (err)
                            {
                                console.log('Could not remove ticket "%s" from context map "%s". Cause: %s', ticket, context, err);

                                reject(err);
                            }
                            else
                            {
                                resolve(removed);
                            }
                        });
                    }
                    else
                    {
                        resolve(false);
                    }
                }
                else
                {
                    // Malformed ticket in the DB: delete
                    client.del(CONST.VALID_PREFIX + ticket, err =>
                    {
                        if (err)
                        {
                            console.log('Could not delete supposedly-malformed ticket. Cause: %s', err);

                            reject(err);
                        }

                        client.del(CONST.EXPIRED_PREFIX + ticket, err2 =>
                        {
                            if (err2)
                            {
                                console.log('Could not fully delete supposedly-malformed ticket. Cause: %s', err2);

                                reject(err2);
                            }

                            client.lrem(context, '1', ticket, (err3, removed) =>
                            {
                                if (err3)
                                {
                                    console.log('Could not remove supposedly-malformed ticket "%s" from context map "%s". Cause: %s', ticket, context, err3);

                                    reject(err3);
                                }
                                else
                                {
                                    resolve(removed);
                                }
                            });
                        });
                    });
                }
            });
        }
        else
        {
            reject();
        }
    });
}


exports.expireall = function(req, res, next)
{
    const reply = {'status': CONST.ERROR};

    let context = req.params.context;

    if (context)
    {
        context = CONST.CONTEXTS_PREFIX + context;

        client.lrange(context, '0', '-1', (err, tickets) =>
        {
            if (err)
            {
                console.log('Error when retrieving tickets for context "%s": %s', context, err);

                reply.status = CONST.ERROR;
                reply.cause = err;

                res.send(500, reply);

                next();
            }
            else
            {
                if (tickets.length > 0)
                {
                    const promises = tickets.map( ticket =>
                    {
                        return removeTicket(context, ticket);
                    });

                    Promise.all(promises)
                    .then( deletedTickets =>
                    {
                        let deletedCount = deletedTickets.reduce( (total, deleted) =>
                        {
                            if (isNaN(total))
                            {
                                total = 0;
                            }

                            if (deleted)
                            {
                                total++;
                            }

                            return total;
                        });

                        // When only one ticket is processed, 'reduce' gets skipped...
                        if (deletedCount === true)
                        {
                            deletedCount = 1;
                        }
                        else if (deletedCount === false)
                        {
                            deletedCount = 0;
                        }

                        reply.status = CONST.OK;
                        reply.expired = deletedCount;

                        res.send(reply);

                        next();
                    });
                }
                else
                {
                    reply.status = CONST.NOT_OK;
                    reply.cause = CONST.ERRORS.CONTEXT_NOT_FOUND;

                    res.send(404, reply);

                    next();
                }
            }
        });
    }
    else
    {
        reply.status = CONST.ERROR;
        reply.err = CONST.ERRORS.EMPTY_REQUEST;

        res.send(400, reply);

        next();
    }
};
