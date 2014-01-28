/*
 * REQUIRES
 */
var fs      = require("fs");
var cluster = require("cluster");
var express = require("express");

var Log     = require("log");


/*
 * CONFIGURATION
 */
var PORT = 8124;

var routes = {
                 'tickets' :   require('./routes/tickets') ,
                 'contexts':   require('./routes/contexts')
             };

var app = express();

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
    app.locals.pretty = true;
    
    // Let logs go to stdout
    global.log = new Log("debug");
});

app.configure('production', function()
{
    app.use(express.errorHandler());
    
    global.log = new Log("info", fs.createWriteStream("/var/log/bagarino_w" + cluster.worker.id + ".log"));
});


/*
 * ROUTES BINDING
 */
app.get('/tickets/new', routes.tickets.new);
app.get('/tickets/:ticket/status', routes.tickets.status);
app.get('/tickets/:ticket/expire', routes.tickets.expire);
app.get('/contexts/:context/expireall', routes.contexts.expireall);


/*
 * START ALL
 */
app.listen(PORT, function()
{
    // Drop privileges if we are running as root
    if (process.getgid() === 0)
    {
        process.setgid("nobody");
        process.setuid("nobody");
    }
});

global.log.info("BAGARINO server listening on port %d in %s mode [worker is %s]",
                PORT,
                app.settings.env,
                cluster.worker.id);


/*
 * PROCESS HANDLING
 */

// Gracefully handle SIGTERM
process.on("SIGTERM", function()
{
    if (app)
    {
        app.close(function()
        {
            // Disconnect from cluster master
            if (process.disconnect)
            {
                process.disconnect();
            }
        });
    }
});

