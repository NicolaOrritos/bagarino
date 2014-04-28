
// [todo] - Add documentation for contexts-based multi-ticket expiration

var redis = require('redis');
var CONST = require('../lib/const');

var client = redis.createClient();

client.on("error", function (err)
{
    global.log.error("Got an error from the Redis client: " + err);
});

var REDIS_DB = 3;






var EXPIRED_TICKET = "EXPIRED";


function removeTicket(context, ticket, metacallback)
{
    if (ticket)
    {
        client.hget(CONST.VALID_TICKET_PREFIX + ticket, "policy", function(error, policy_str)
        {
            if (policy_str)
            {
                var policy = JSON.parse(policy_str);
                
                if (policy.manual_expiration === true
                    || policy.can_force_expiration === true)
                {
                    // Save the "expired" counterpart when manually expiring:
                    client.set(CONST.EXPIRED_TICKET_PREFIX + ticket, CONST.EXPIRED_TICKET);
                    client.expire(CONST.EXPIRED_TICKET_PREFIX + ticket, policy.remember_until);
                    
                    // Finally delete valid ticket
                    client.del(CONST.VALID_TICKET_PREFIX + ticket);
                    
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
                client.del(CONST.VALID_TICKET_PREFIX + ticket);
                
                metacallback(false);
            }
        });
    }
}


exports.expireall = function(req, res)
{
    var reply = {"status": "ERROR", "cause": "unknown"};
    
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

                    console.log("Metacallback called. Processed: %s", processed);

                    if (processed === tickets.length)
                    {
                        reply.status = "OK";
                        reply.expired = deletedCount;

                        res.send(reply);
                    }
                }
                
                
                if (err)
                {
                    console.log("Error when retrieving tickets for context '%s': %s", context, err);
                    
                    reply.status = "ERROR";
                    reply.cause = err;
                    
                    res.status(500).send(reply);
                }
                else
                {
                    console.log("Tickets found: %s", JSON.stringify(tickets));
                    
                    if (tickets.length > 0)
                    {
                        for (var a=0; a<tickets.length; a++)
                        {
                            var ticket = tickets[a];
                            
                            console.log("Removing ticket '%s'...", ticket);
                            
                            removeTicket(context, ticket, metacallback);
                        }
                    }
                    else
                    {
                        reply.status = "OK";
                        reply.cause = "empty_context";
        
                        res.send(reply);
                    }
                }
            });
        });
    }
    else
    {
        reply.status = "ERROR";
        reply.err = "empty_request";
        
        res.status(400).send(reply);
    }
};
                  