
// [todo] - Add documentation for contexts-based multi-ticket expiration

var redis = require('redis');
var CONST = require('../lib/const');

var P     = global.Promise || require('bluebird');


var client = redis.createClient();

client.on('error', function (err)
{
    global.log.error('Got an error from the Redis client: ' + err);
});

var REDIS_DB = 3;


function removeTicket(context, ticket)
{
    return new P(function(resolve, reject)
    {
        if (ticket && context)
        {
            client.hget(CONST.VALID_PREFIX + ticket, 'policy', function(error, policy_str)
            {
                if (policy_str)
                {
                    var policy = JSON.parse(policy_str);

                    if (   policy.manual_expiration === true
                        || policy.can_force_expiration === true)
                    {
                        // Save the 'expired' counterpart when manually expiring:
                        client.set(CONST.EXPIRED_PREFIX + ticket, CONST.EXPIRED_TICKET);
                        client.expire(CONST.EXPIRED_PREFIX + ticket, policy.remember_until);

                        // Finally delete valid ticket
                        client.del(CONST.VALID_PREFIX + ticket);

                        client.lrem(context, '1', ticket, function(err, removed)
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
                    client.del(CONST.VALID_PREFIX + ticket, function(err)
                    {
                        if (err)
                        {
                            console.log('Could not delete supposedly-malformed ticket. Cause: %s', err);
                            
                            reject(err);
                        }

                        client.del(CONST.EXPIRED_PREFIX + ticket, function(err2)
                        {
                            if (err2)
                            {
                                console.log('Could not fully delete supposedly-malformed ticket. Cause: %s', err2);
                                
                                reject(err2);
                            }

                            client.lrem(context, '1', ticket, function(err3, removed)
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


exports.expireall = function(req, res)
{
    var reply = {'status': CONST.ERROR};
    
    var context = req.params.context;
    
    if (context)
    {
        context = CONST.CONTEXTS_PREFIX + context;
        
        client.select(REDIS_DB, function()
        {
            client.lrange(context, '0', '-1', function(err, tickets)
            {
                if (err)
                {
                    console.log('Error when retrieving tickets for context "%s": %s', context, err);
                    
                    reply.status = CONST.ERROR;
                    reply.cause = err;
                    
                    res.status(500).send(reply);
                }
                else
                {
                    if (tickets.length > 0)
                    {
                        P.map(tickets, function(ticket)
                        {
                            return removeTicket(context, ticket);
                        })
                        .reduce(function(total, deleted)
                        {
                            if (deleted)
                            {
                                total++;
                            }
                            
                            return total;
                        })
                        .then(function(deletedCount)
                        {
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
                        });
                    }
                    else
                    {
                        reply.status = CONST.NOT_OK;
                        reply.cause = CONST.ERRORS.CONTEXT_NOT_FOUND;
        
                        res.status(404).send(reply);
                    }
                }
            });
        });
    }
    else
    {
        reply.status = CONST.ERROR;
        reply.err = CONST.ERRORS.EMPTY_REQUEST;
        
        res.status(400).send(reply);
    }
};
                  