'use strict';


var request = require('request');
var sleep   = require('sleep').sleep;
var fs      = require('fs');


module.exports = function (grunt)
{
    // show elapsed time at the end
    require('time-grunt')(grunt);
    
    // load all grunt tasks
    require('load-grunt-tasks')(grunt);
    
    grunt.loadNpmTasks('grunt-plato');

    var reloadPort = 35729, files;

    grunt.initConfig(
    {
        pkg: grunt.file.readJSON('package.json'),
        
        nodeunit:
        {
            files: ['test/**/*_test.js']
        },
        
        jshint:
        {
            options:
            {
                jshintrc: '.jshintrc',
                reporter: require('jshint-stylish')
            },
            gruntfile:
            {
                src: 'Gruntfile.js'
            },
            main:
            {
                src: ['bin/start-bagarino-daemon*', './app.js']
            },
            routes:
            {
                src: ['routes/**/*.js']
            },
            test:
            {
                src: ['test/**/*.js']
            }
        },
        
        plato: {
            analyze_all: {
                options : {
                    jshint : grunt.file.readJSON('.jshintrc')
                },
                
                files: {
                    'reports': ['bin/**/*.js', 'lib/**/*.js', 'routes/**/*.js']
                }
            }
        },
        
        develop: {
            server: {
                file: 'bin/start-bagarino-daemon_dev'
            }
        },
        
        watch: {
            options: {
                nospawn: true,
                livereload: reloadPort
            },
            server: {
                files: [
                    'bin/start-bagarino-daemon_dev',
                    './app.js',
                    'routes/*.js'
                ],
                tasks: ['develop', 'delayed-livereload']
            }
        }
    });

    grunt.config.requires('watch.server.files');
    files = grunt.config('watch.server.files');
    files = grunt.file.expand(files);

    grunt.registerTask('delayed-livereload', 'Live reload after the node server has restarted.', function () {
        var done = this.async();
        setTimeout(function () {
            request.get('http://localhost:' + reloadPort + '/changed?files=' + files.join(','),  function (err, res) {
                var reloaded = !err && res.statusCode === 200;
                if (reloaded) {
                    grunt.log.ok('Delayed live reload successful.');
                } else {
                    grunt.log.error('Unable to make a delayed live reload.');
                }
                done(reloaded);
            });
        }, 500);
    });
    
    grunt.registerTask('warmup', 'Check system preconditions before starting the systems', function()
    {
        var done   = this.async();
        
        // Check whether Redis exists
        var redis  = require("redis");
        var client = redis.createClient();
        client.on("error", function(err)
        {
            grunt.log.writeln('Redis error: ' + err);
            done(false);
        });
        client.on("ready", function()
        {
            grunt.log.writeln("Everything's fine");
            done(true);
        });
    });
    
    grunt.registerTask('startserver', 'Start the service', function()
    {
        grunt.task.requires('warmup');
        
        grunt.log.writeln('Running bagarino server from "%s"...', process.cwd());
        
        var fork = require('child_process').fork;
        
        fork('bin/start-bagarino-daemon_dev', [], {detached: true, cwd: process.cwd(), env: process.env});
    });
    
    grunt.registerTask('stopserver', 'Stop the service', function()
    {
        var pid = fs.readFileSync('./logs/bagarino.pid', {encoding: 'UTF-8'});
        
        grunt.log.writeln('Stopping bagarino server with PID "%s"...', pid);
        
        process.kill(pid, 'SIGTERM');
    });
    
    grunt.registerTask('wait', 'Wait N seconds', function()
    {
        var secs = 1;
        
        grunt.log.writeln('Waiting %d second(s) before continuing...', secs);
        
        sleep(secs);
    });
    
    grunt.registerTask('start', ['warmup', 'startserver']);
    
    grunt.registerTask('stop', ['stopserver']);
    
    grunt.registerTask('test', ['jshint', 'start', 'wait', 'nodeunit', 'wait', 'stop', 'plato']);

    grunt.registerTask('default', ['start', 'watch']);
};
