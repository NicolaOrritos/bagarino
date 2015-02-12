'use strict';

var CONST = require('./const');


var answer =
{
    'status': CONST.ERROR,
    'cause' : CONST.ERRORS.MALFORMED_REQUEST
};


module.exports =
{
    'notpermitted': function(req, res, next)
    {
        global.log.error('Got a malformed request for URL: ' + req.url);
        
        res.send(400, answer);
        
        return next();
    }
};
