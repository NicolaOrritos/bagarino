
/**
 * Module dependencies.
 */

var express = require("express");

var routes = {
                  'tickets':   require('./routes/tickets')
             };

var app = express();


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


app.listen(PORT);

console.log("BAGARINO-Express server listening on port %d in %s mode", PORT, app.settings.env);




