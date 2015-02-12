
// [todo] - Tune logging subsystem and use it thoroughly


var fs      = require('fs');
var cluster = require('cluster');
var restify = require('restify');
var sjl     = require('sjl');
var Log     = require('log');


var defaults =
{
    'ENVIRONMENT': 'production',

    'PORT': 8124,
    'HTTPS_PORT': 8443,

    'SERVER_TYPE': {
        'HTTPS': {
            'ENABLED': false,
            'KEY':  'private/key.pem',
            'CERT': 'private/cert.crt'
        },
        'HTTP': {
            'ENABLED': true
        }
    },

    'LOGGING': {
        'ENABLED': true,
        'PATH': '/var/log'
    }
};

var CONF = sjl('/etc/bagarino.conf', defaults);


// Initialize logging
if ('development' === CONF.ENVIRONMENT)
{
    // Let's log to stdout
    global.log = new Log('debug');
}
else
{
    global.log = new Log('info', fs.createWriteStream(CONF.LOGGING.PATH + '/bagarino_w' + cluster.worker.id + '.log'));
}


var routes =
{
    'tickets' : require('./lib/tickets'),
    'contexts': require('./lib/contexts'),
    'utils'   : require('./lib/utils')
};

function initAndStart(server, port)
{
    if (server && port)
    {
        server.use(restify.queryParser());
        
        server.get('/tickets/new',                 routes.tickets.new);
        server.get('/tickets/:ticket/status',      routes.tickets.status);
        server.get('/tickets/:ticket/expire',      routes.tickets.expire);
        server.get('/contexts/:context/expireall', routes.contexts.expireall);
        
        server.on ('NotFound',                     routes.utils.notpermitted);
        server.on ('MethodNotAllowed',             routes.utils.notpermitted);
        server.on ('uncaughtException',            routes.utils.notpermitted);

        server.listen(port, function()
        {
            // Drop privileges if we are running as root
            if (process.getgid() === 0)
            {
                process.setgid('nobody');
                process.setuid('nobody');
            }

            global.log.info('BAGARINO server listening on port %d in %s mode [worker is %s]',
                            port,
                            CONF.ENVIRONMENT,
                            cluster.worker.id);
        });
        
        // Gracefully handle SIGTERM
        process.on('SIGTERM', function()
        {
            server.close(function()
            {
                // Disconnect from cluster master
                if (process.disconnect)
                {
                    process.disconnect();
                }
            });
        });
    }
}


if (CONF.SERVER_TYPE.HTTP.ENABLED)
{
    var server = restify.createServer();

    initAndStart(server, CONF.PORT);
}

if (CONF.SERVER_TYPE.HTTPS.ENABLED)
{
    var privateKey  = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.KEY,  'utf8');
    var certificate = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.CERT, 'utf8');

    var credentials = {key: privateKey, certificate: certificate};

    var httpsServer = restify.createServer(credentials);

    initAndStart(httpsServer, CONF.HTTPS_PORT);
}

