
// [todo] - Tune logging subsystem and use it thoroughly


/*
 * REQUIRES
 */
var fs      = require("fs");
var http    = require("http");
var https   = require("https");
var cluster = require("cluster");
var express = require("express");
var sjl     = require("sjl");
var Log     = require("log");


/*
 * CONFIGURATION
 */


var defaults = {
    "PORT": 8124,
    "HTTPS_PORT": 8443,

    "SERVER_TYPE": {
        "HTTPS": {
            "ENABLED": true,
            "KEY":  "private/key.pem",
            "CERT": "private/cert.crt"
        },
        "HTTP": {
            "ENABLED": false
        }
    }
};

var CONF = sjl("/etc/bagarino.conf", defaults);


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
var routes = {
    'tickets' :   require('./routes/tickets') ,
    'contexts':   require('./routes/contexts')
};

app.get('/tickets/new', routes.tickets.new);
app.get('/tickets/:ticket/status', routes.tickets.status);
app.get('/tickets/:ticket/expire', routes.tickets.expire);
app.get('/contexts/:context/expireall', routes.contexts.expireall);


/*
 * START ALL
 */
if (CONF.SERVER_TYPE.HTTP.ENABLED)
{
    http.createServer(app).listen(CONF.PORT, function()
    {
        // Drop privileges if we are running as root
        if (process.getgid() === 0)
        {
            process.setgid("nobody");
            process.setuid("nobody");
        }
        
        global.log.info("BAGARINO HTTP server listening on port %d in %s mode [worker is %s]",
                        CONF.PORT,
                        app.settings.env,
                        cluster.worker.id);
    });
}

if (CONF.SERVER_TYPE.HTTPS.ENABLED)
{
    var privateKey  = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.KEY,  "utf8");
    var certificate = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.CERT, "utf8");
    
    var credentials = {key: privateKey, cert: certificate};
    
    https.createServer(credentials, app).listen(CONF.HTTPS_PORT, function()
    {
        // Drop privileges if we are running as root
        if (process.getgid() === 0)
        {
            process.setgid("nobody");
            process.setuid("nobody");
        }
        
        global.log.info("BAGARINO HTTPS server listening on port %d in %s mode [worker is %s]",
                        CONF.HTTPS_PORT,
                        app.settings.env,
                        cluster.worker.id);
    });
}


/*
 * PROCESS SIGTERM HANDLING
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

