
// [todo] - Tune logging subsystem and use it thoroughly

'use strict';

const fs      = require('fs');
const cluster = require('cluster');
const restify = require('restify');
const Log     = require('log');
const utils   = require('./lib/utils');
const CONF    = require('./lib/conf');
const CONST   = require('./lib/const');


// Initialize logging
if (CONST.ENV.DEVELOPMENT === CONF.ENVIRONMENT)
{
    global.log = new Log('debug');
}
else
{
    global.log = new Log('info');
}


const routes =
{
    'tickets' : require('./lib/tickets'),
    'contexts': require('./lib/contexts'),
    'utils'   : require('./lib/utils')
};

function initAndStart(server, port)
{
    if (server && port)
    {
        server.use (utils.toobusy);  // Reject requests when too busy

        server.on  ('NotFound',                     routes.utils.notpermitted);
        server.on  ('MethodNotAllowed',             routes.utils.notpermitted);
        server.on  ('uncaughtException',            routes.utils.notpermitted);

        server.get ('/status',                      routes.utils.status);

        server.use(restify.queryParser());

        server.get ('/tickets/new',                 routes.tickets.new);
        server.get ('/tickets/:ticket/status',      routes.tickets.status);
        server.get ('/tickets/:ticket/policy',      routes.tickets.policy);
        server.get ('/tickets/:ticket/expire',      routes.tickets.expire);
        server.get ('/contexts/:context/expireall', routes.contexts.expireall);

        server.use (restify.acceptParser('application/json'));
        server.use (restify.bodyParser({maxBodySize: CONST.ONE_MiB}));

        server.post('/tickets/new/withpayload',     routes.tickets.withpayload);
        server.get ('/tickets/:ticket/payload',     routes.tickets.payload);


        server.listen(port, () =>
        {
            let workerID = 'test';

            if (cluster && cluster.worker)
            {
                workerID = cluster.worker.id;
            }

            global.log.info('BAGARINO server listening on port %d in %s mode [worker is %s]',
                            port,
                            CONF.ENVIRONMENT,
                            workerID);
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
