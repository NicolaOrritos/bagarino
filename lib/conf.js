'use strict';

var sjl     = require('sjl');


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
    },

    'SECONDS_TO_REMEMBER_TICKETS_UNTIL': 864000
};

module.exports = sjl('/etc/bagarino.conf', defaults);
