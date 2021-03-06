'use strict';

const sjl = require('sjl');


const defaults =
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

    "REDIS": {
        "HOST": "localhost",
        "PORT": 6379,
        "DB": 3
    },

    'SECONDS_TO_REMEMBER_TICKETS_UNTIL': 864000
};

let result = sjl('/etc/bagarino.conf', defaults);


// Backward compatibility:
result.REDIS = result.REDIS || defaults.REDIS;


module.exports = result;
