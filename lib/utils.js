'use strict';

const toobusy = require('toobusy-js');
const restify = require('restify');
const CONST   = require('./const');


const answer =
{
    'status': CONST.ERROR,
    'cause' : CONST.ERRORS.MALFORMED_REQUEST
};


module.exports =
{
    notpermitted: function(req, res, err)
    {
        global.log.error('Got an error for URL "%s": %s', req.url, err);

        if (err)
        {
            global.log.error(err.stack);
        }

        res.send(400, answer);
    },

    toobusy: function(req, res, next)
    {
        if (toobusy())
        {
            next(new restify.ServiceUnavailableError('The server is too busy right now'));
        }
        else
        {
            next();
        }
    },

    status: function(req, res, next)
    {
        // Get info about this process memory usage:
        const usage = process.memoryUsage();

        // Use human-readable memory sizes:
        usage.rss       = '~' + parseInt(usage.rss       / 1024 / 1024) + 'MB';
        usage.heapTotal = '~' + parseInt(usage.heapTotal / 1024 / 1024) + 'MB';
        usage.heapUsed  = '~' + parseInt(usage.heapUsed  / 1024 / 1024) + 'MB';

        // Get up-time of this process:
        const uptime = process.uptime();

        // Get info about NodeJS version:
        const nodeVersion = process.version;

        // Then return 200 if everything is OK:
        res.send({status: CONST.OK, memory: usage, uptime: uptime, 'node-version': nodeVersion});

        next();
    }
};
