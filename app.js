
/**
 * Module dependencies.
 */

var fs      = require("fs");
var cluster = require("cluster");
var express = require("express");

var Log     = require("log");



// Code to run if we're in the master process
if (cluster.isMaster)
{
    // Count the machine's CPUs
    var cpuCount = require('os').cpus().length;

    // Create a worker for each CPU
    for (var i = 0; i < cpuCount; i += 1)
    {
        cluster.fork();
    }

// Code to run if we're in a worker process
}
else
{
    var routes = {
                     'tickets':   require('./routes/tickets')
                 };

    var app = express();
    
    var log = new Log("debug", fs.createWriteStream("bagarino_w" + cluster.worker.id + ".log"));


    // Configuration

    var PORT = 8124;

    app.configure(function()
    {
        app.set('view engine', 'jade');
        app.set('views', __dirname + '/views');

        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(app.router);
        app.use(express.static(__dirname + '/public'));

    });

    app.configure('development', function()
    {
        app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    });

    app.configure('production', function()
    {
        app.use(express.errorHandler());
    });


    // Routes
    app.get('/tickets/new', routes.tickets.new);
    app.get('/tickets/:ticket/status', routes.tickets.status);
    app.get('/tickets/:ticket/expire', routes.tickets.expire);


    app.listen(PORT);

    log.info("BAGARINO-Express server listening on port %d in %s mode [worker is %s]",
             PORT,
             app.settings.env,
             cluster.worker.id);
}

// Listen for dying workers
cluster.on('exit', function (worker)
{
    // Replace the dead worker,
    // we're not sentimental
    log.info('Worker ' + worker.id + ' died :(');
    cluster.fork();
});
