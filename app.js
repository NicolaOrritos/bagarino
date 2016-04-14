
// [todo] - Tune logging subsystem and use it thoroughly

'use strict';

const fs      = require('fs');
const cluster = require('cluster');
const restify = require('restify');
const Log     = require('log');
const CONF    = require('./lib/conf');
const CONST   = require('./lib/const');


// Initialize logging
if (CONST.ENV.DEVELOPMENT === CONF.ENVIRONMENT)
{
    // Let's log to stdout
    global.log = new Log('debug');
}
else
{
    global.log = new Log('info', fs.createWriteStream(CONF.LOGGING.PATH + '/bagarino_w' + cluster.worker.id + '.log'));
}


const routes =
{
    'tickets' : require('./lib/tickets'),
    'contexts': require('./lib/contexts'),
    'utils'   : require('./lib/utils')
};

function initAndStart(server, port)
{
    // Drop privileges if we are running as root
    if (process.getgid() === 0)
    {
        process.setgid('nobody');
        process.setuid('nobody');
    }

    if (server && port)
    {
        server.use(restify.queryParser());

        server.get('/tickets/new',                 routes.tickets.new);
        server.get('/tickets/:ticket/status',      routes.tickets.status);
        server.get('/tickets/:ticket/policy',      routes.tickets.policy);
        server.get('/tickets/:ticket/expire',      routes.tickets.expire);
        server.get('/contexts/:context/expireall', routes.contexts.expireall);

        server.on ('NotFound',                     routes.utils.notpermitted);
        server.on ('MethodNotAllowed',             routes.utils.notpermitted);
        server.on ('uncaughtException',            routes.utils.notpermitted);

        server.listen(port, () =>
        {
            global.log.info('BAGARINO server listening on port %d in %s mode [worker is %s]',
                            port,
                            CONF.ENVIRONMENT,
                            cluster.worker.id);
        });

        // Gracefully handle SIGTERM
        process.on('SIGTERM', () =>
        {
            server.close(function()
            {
                // Exit after server is closed
                process.exit(0);
            });
        });
    }
}


if (CONF.SERVER_TYPE.HTTP.ENABLED)
{
    const httpServer = restify.createServer();

    initAndStart(httpServer, CONF.PORT);
}

if (CONF.SERVER_TYPE.HTTPS.ENABLED)
{
    if (CONF.SERVER_TYPE.HTTP.ENABLED && CONF.PORT === CONF.HTTPS_PORT)
    {
        global.log.error('Could not start bagarino HTTP and HTTPS server on the same port (%s)! Exiting...', CONF.PORT);

        process.exit(1);
    }
    else
    {
        const privateKey  = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.KEY,  'utf8');
        const certificate = fs.readFileSync(CONF.SERVER_TYPE.HTTPS.CERT, 'utf8');

        const credentials = {key: privateKey, certificate: certificate};

        const httpsServer = restify.createServer(credentials);

        initAndStart(httpsServer, CONF.HTTPS_PORT);
    }
}
