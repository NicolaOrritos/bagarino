#!/usr/bin/env node

/**
 * bin/node-simple-http-daemon
 */

console.log("Starting bagarino daemon...");

// Everything above this line will be executed twice
require("daemon")();


var cluster = require("cluster");


// Number of CPUs
var cpus = require("os").cpus().length;

/**
 * Creates a new worker when running as cluster master.
 * Runs the HTTP server otherwise.
 */
function createWorker()
{
    if (cluster.isMaster)
    {
        // Fork a worker if running as cluster master
        var child = cluster.fork();
        
        // Replace the dead worker, we're not sentimental
        child.on("exit", function(code, signal)
        {
            console.log("Worker " + worker.id + " died :(");
            console.log("Restarting it...");
            
            createWorker();
        });
    }
    else
    {
        // Run the bagarino server if running as worker
        require("../app");
    }
}

/**
 * Creates the specified number of workers.
 * @param  {Number} n Number of workers to create.
 */
function createWorkers(n)
{
    while (n > 0)
    {
        n--;
        createWorker();
    }
}

/**
 * Kills all workers with the given signal.
 * Also removes all event listeners from workers before sending the signal
 * to prevent respawning.
 * @param  {Number} signal
 */
function killAllWorkers(signal)
{
    var uniqueID = undefined;
    var worker = undefined;
    
    for (uniqueID in cluster.workers)
    {
        if (cluster.workers.hasOwnProperty(uniqueID))
        {
            worker = cluster.workers[uniqueID];
            
            worker.removeAllListeners();
            worker.process.kill(signal);
        }
    }
}

/**
 * Restarts the workers.
 */
process.on("SIGHUP", function()
{
    killAllWorkers("SIGTERM");
    createWorkers(cpus);
});

/**
 * Gracefully Shuts down the workers.
 */
process.on("SIGTERM", function()
{
    killAllWorkers("SIGTERM");
});


// Create a child for each CPU
createWorkers(cpus);
