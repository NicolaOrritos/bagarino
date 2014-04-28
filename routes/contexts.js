
// [todo] - Add documentation for contexts-based multi-ticket expiration

var redis = require('redis');
var CONST = require('../lib/const');

var client = redis.createClient();

client.on("error", function (err)
{
    global.log.error("Got an error from the Redis client: " + err);
});

var REDIS_DB = 3;


function removeTicket(context, ticket, metacallback)
{
    if (ticket && context)
    {
        console.log("Removing ticket '%s' from context '%s'...", (CONST.VALID_PREFIX + ticket), context);
        
        client.hget(CONST.VALID_PREFIX + ticket, "policy", function(error, policy_str)
        {
            if (policy_str)
            {
                var policy = JSON.parse(policy_str);
                
                if (policy.manual_expiration === true
                    || policy.can_force_expiration === true)
                {
                    // Save the "expired" counterpart when manually expiring:
                    client.set(CONST.EXPIRED_PREFIX + ticket, CONST.EXPIRED_TICKET);
                    client.expire(CONST.EXPIRED_PREFIX + ticket, policy.remember_until);
                    
                    // Finally delete valid ticket
                    client.del(CONST.VALID_PREFIX + ticket);
                    
                    client.lrem(context, "1", ticket, function(err, removed)
                    {
                        if (err)
                        {
                            console.log("Could not remove ticket '%s' from context map '%s'. Cause: %s", ticket, context, err);
                        }
                        else if (removed)
                        {
                            console.log("Removed '%s' ticket(s)", removed);
                            
                            metacallback(true);
                        }
                        else
                        {
                            metacallback(false);
                        }
                    });
                }
                else
                {
                    metacallback(false);
                }
            }
            else
            {
                // Malformed ticket in the DB: delete
                client.del(CONST.VALID_PREFIX + ticket, function(err)
                {
                    if (err)
                    {
                        console.log("Could not delete supposedly-malformed ticket. Cause: %s", err);
                    }
                    
                    client.del(CONST.EXPIRED_PREFIX + ticket, function(err2)
                    {
                        if (err2)
                        {
                            console.log("Could not fully delete supposedly-malformed ticket. Cause: %s", err2);
                        }
                        
                        client.lrem(context, "1", ticket, function(err, removed)
                        {
                            if (err)
                            {
                                console.log("Could not remove supposedly-malformed ticket '%s' from context map '%s'. Cause: %s", ticket, context, err);
                            }
                            else if (removed)
                            {
                                console.log("Removed '%s' supposedly-malformed ticket(s) from context-map", removed);

                                metacallback(true);
                            }
                            else
                            {
                                metacallback(false);
                            }
                        });
                    });
                });
                
                metacallback(false);
            }
        });
    }
}


exports.expireall = function(req, res)
{
    var reply = {"status": CONST.ERROR};
    
    var context = req.param("context");
    
    if (context)
    {
        context = CONST.CONTEXTS_PREFIX + context;
        
        client.select(REDIS_DB, function()
        {
            client.lrange(context, "0", "-1", function(err, tickets)
            {
                var processed    = 0;
                var deletedCount = 0;

                function metacallback(deleted)
                {
                    processed++;

                    if (deleted)
                    {
                        deletedCount++;
                    }

                    if (processed === tickets.length)
                    {
                        reply.status = CONST.OK;
                        reply.expired = deletedCount;

                        res.send(reply);
                    }
                }
                
                
                if (err)
                {
                    console.log("Error when retrieving tickets for context '%s': %s", context, err);
                    
                    reply.status = CONST.ERROR;
                    reply.cause = err;
                    
                    res.status(500).send(reply);
                }
                else
                {
                    if (tickets.length > 0)
                    {
                        for (var a=0; a<tickets.length; a++)
                        {
                            var ticket = tickets[a];
                            
                            removeTicket(context, ticket, metacallback);
                        }
                    }
                    else
                    {
                        reply.status = CONST.OK;
                        reply.cause = CONST.ERRORS.EMPTY_CONTEXT;
        
                        res.send(reply);
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
                  