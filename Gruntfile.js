'use strict';


const request = require('request');
const sleep   = require('sleep').sleep;


module.exports = function(grunt)
{
    // show elapsed time at the end
    require('time-grunt')(grunt);

    // load all grunt tasks
    require('load-grunt-tasks')(grunt);

    grunt.loadNpmTasks('grunt-plato');

    const reloadPort = 35729;
    let files;

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
            lib:
            {
                src: ['lib/**/*.js']
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
                    'reports': ['bin/**/*.js', 'lib/**/*.js']
                }
            }
        },

        watch: {
            options: {
                nospawn: true,
                livereload: reloadPort
            },
            server: {
                files: [
                    'bin/start-bagarino-daemon',
                    './app.js'
                ],
                tasks: ['develop', 'delayed-livereload']
            }
        }
    });

    grunt.config.requires('watch.server.files');
    files = grunt.config('watch.server.files');
    files = grunt.file.expand(files);

    // Not using arrow-syntax functions because this.async will loose meaning:
    grunt.registerTask('delayed-livereload', 'Live reload after the node server has restarted.', function()
    {
        const done = this.async();

        setTimeout( () =>
        {
            request.get('http://localhost:' + reloadPort + '/changed?files=' + files.join(','), (err, res) =>
            {
                const reloaded = !err && res.statusCode === 200;

                if (reloaded)
                {
                    grunt.log.ok('Delayed live reload successful.');
                }
                else
                {
                    grunt.log.error('Unable to make a delayed live reload.');
                }

                done(reloaded);
            });

        }, 500);
    });

    // Not using arrow-syntax functions because this.async will loose meaning:
    grunt.registerTask('warmup', 'Check system preconditions before starting the systems', function()
    {
        const done = this.async();

        // Check whether Redis exists
        const redis  = require("redis");
        const client = redis.createClient();

        client.on("error", err =>
        {
            grunt.log.writeln('Redis error: ' + err);
            done(false);
        });

        client.on("ready", () =>
        {
            grunt.log.writeln("Everything's fine");
            done(true);
        });
    });

    grunt.registerTask('startserver', 'Start the service', () =>
    {
        grunt.task.requires('warmup');

        grunt.log.writeln('Running bagarino server from "%s"...', process.cwd());

        const fork = require('child_process').fork;

        fork('bin/start-bagarino-daemon', ['--dev'], {detached: true, cwd: process.cwd(), env: process.env});
    });

    grunt.registerTask('wait', 'Wait N seconds', () =>
    {
        const secs = 1;

        grunt.log.writeln('Waiting %d second(s) before continuing...', secs);

        sleep(secs);
    });

    grunt.registerTask('start', ['warmup', 'startserver']);

    grunt.registerTask('test', ['jshint', 'start', 'wait', 'nodeunit', 'wait', 'plato']);

    grunt.registerTask('default', ['start', 'watch']);
};
