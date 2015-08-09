'use strict';

var Prometheus = require('prometheus-client');

var client = new Prometheus();

var news1Counter = client.newCounter(
{
    namespace:  "tickets_new",
    name:       "ok",
    help:       "The number of tickets successfully created"
});

var news2Counter = client.newCounter(
{
    namespace:  "tickets_new",
    name:       "not_ok",
    help:       "The number of tickets that could not be created"
});

var status1Counter = client.newCounter(
{
    namespace:  "tickets_status",
    name:       "valid",
    help:       "The number of valid statuses requested"
});

var status2Counter = client.newCounter(
{
    namespace:  "tickets_status",
    name:       "notfound",
    help:       "The number of invalid (404) statuses requested"
});


module.exports =
{
    metrics: client.metricsFunc(),

    counters:
    {
        new: function(req, res, next)
        {
            if (res.statusCode === 200)
            {
                news1Counter.increment({count: 1});
            }
            else
            {
                news2Counter.increment({count: 1, status: res.statusCode});
            }

            return next();
        },

        status: function(req, res, next)
        {
            if (res.statusCode === 200)
            {
                status1Counter.increment({count: 1});
            }
            else
            {
                status2Counter.increment({count: 1, status: res.statusCode});
            }

            console.log(res.body);

            return next();
        }
    }
};
