
// [todo] - Tune logging subsystem and use it thoroughly


/*
 * REQUIRES
 */
var fs             = require("fs");
var http           = require("http");
var https          = require("https");
var cluster        = require("cluster");
var express        = require("express");
var favicon        = require('static-favicon');
var errorHandler   = require('errorhandler');
var morgan         = require('morgan');
var bodyParser     = require('body-parser');
var methodOverride = require('method-override');
var path           = require('path');
var sjl            = require("sjl");
var Log            = require("log");


/*
 * DEFAULT CONFIGURATION
 */
var defaults = {
    "ENVIRONMENT": "production",
    
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
    },
    
    "LOGGING": {
        "ENABLED": true,
        "PATH": "/var/log"
    }
};

var CONF = sjl("/etc/bagarino.conf", defaults);


/*
 * EXPRESS INITIALIZATION
 */
var app = express();

app.set('port', CONF.PORT);
app.use(favicon());
app.use(morgan('dev'));
app.use(bodyParser());
app.use(methodOverride());

if ('development' === app.get('env'))
{
    app.locals.pretty = true;
    
    // Let logs go to stdout
    global.log = new Log("debug");
}
else
{
    global.log = new Log("info", fs.createWriteStream(CONF.LOGGING.PATH + "/bagarino_w" + cluster.worker.id + ".log"));
}


/*
 * ROUTES BINDING
 */
var routes = {
    'tickets' :   require('./routes/tickets'),
    'contexts':   require('./routes/contexts')
};

app.get('/tickets/new',                 routes.tickets.new);
app.get('/tickets/:ticket/status',      routes.tickets.status);
app.get('/tickets/:ticket/expire',      routes.tickets.expire);
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
    console.log("Received SIGTERM");
    
    if (app)
    {
        console.log("Received SIGTERM");
        
        app.close(function()
        {
            console.log("Received SIGTERM");
            
            // Disconnect from cluster master
            if (process.disconnect)
            {
                process.disconnect();
            }
        });
    }
});

