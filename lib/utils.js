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
    }
};
