'use strict';

var Prometheus = require('prometheus-client');
var CONF       = require('./conf');


var client;
var news1Counter;
var news2Counter;
var status1Counter;
var status2Counter;

if (CONF.ENABLE_PROMETHEUS)
{
    client = new Prometheus();

    news1Counter = client.newCounter(
    {
        namespace:  'tickets_new',
        name:       'ok',
        help:       'The number of tickets successfully created'
    });

    news2Counter = client.newCounter(
    {
        namespace:  'tickets_new',
        name:       'not_ok',
        help:       'The number of tickets that could not be created'
    });

    status1Counter = client.newCounter(
    {
        namespace:  'tickets_status',
        name:       'valid',
        help:       'The number of valid statuses requested'
    });

    status2Counter = client.newCounter(
    {
        namespace:  'tickets_status',
        name:       'notfound',
        help:       'The number of invalid (404) statuses requested'
    });
}


module.exports =
{
    metrics: client.metricsFunc(),

    counters:
    {
        new: function(req, res, next)
        {
            if (CONF.ENABLE_PROMETHEUS)
            {
                if (res.statusCode === 200)
                {
                    var count = req.query.count || 1;

                    news1Counter.increment({count: count, policy: req.query.policy});
                }
                else
                {
                    news2Counter.increment({count: 1, status: res.statusCode});
                }
            }

            return next();
        },

        status: function(req, res, next)
        {
            if (CONF.ENABLE_PROMETHEUS)
            {
                if (res.statusCode === 200)
                {
                    status1Counter.increment({count: 1});
                }
                else
                {
                    status2Counter.increment({count: 1, status: res.statusCode});
                }
            }

            return next();
        }
    }
};
