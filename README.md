bagarino
========
"bagarino" _sells_ you tickets and can tell a real ticket from a fake one. Simple, fast and RESTful.
Ask it for a new ticket and it'll give you. Then ask it whether a ticket is still valid or expired. Or whether it is a fake. It'll know for sure.
When tickets expire simply ask bagarino for new ones.

bagarino can be used as a support for a licensing server and as an helper to other systems in an authentication scenario.


Usage
-----
Here's a detailed guide on how to call bagarino for retrieving new tickets and/or validating old ones.

### New tickets
Obtain a new ticket:

    http://localhost:8124/tickets/new
    200 OK {"result":"OK","ticket":"7fd88ab09e40f99767e17df27a723d05562d573b","expires_in":60,"policy":"time_based"}

See the status of the newly created ticket:

    http://localhost:8124/tickets/7fd88ab09e40f99767e17df27a723d05562d573b/status
    200 OK {"status":"VALID","expires_in":54,"policy":"time_based"}

After a few seconds (60 by default) the ticket expires. Then, asking for it will result in the following response:

    200 OK {"status": "EXPIRED"}

Asking for a non-existent ticket results in the following:

    http://localhost:8124/tickets/321somenonsense123/status
    404 Not Found {"status":"ERROR","cause":"not_found"}

By default new tickets have a time-based expire policy and a time-to-live of 60 seconds.
A different policy can be used by specifying the _"policy"_ parameter in query-string:
 * **policy=time_based** is the default one. Add "seconds=300" to make the ticket expire after the non-default delay of 5 minutes.
 * **policy=requests_based** makes the ticket expire after a certain amount of requests of its status you do to bagarino. By default it's 100 requests, but you can otherwise specify e.g. "requests=500" to make it last for 500 requests.
  * **policy=cascading** makes the ticket _depend_ on another one: once the _dependency_ ticket expires the _dependent_ one does as well.
 * **policy=manual_expiration** makes the ticket perpetual, unless you make it expire manually by calling the _"expire"_ verb (explained some lines below)

Let's see some requests that create tickets with different expiration policies:

    http://localhost:8124/tickets/new?policy=requests_based&requests=5
    200 OK {"result":"OK","ticket":"62a315cd7bdae5e84567cad9620f82b5defd3ef0","expires_in":5,"policy":"requests_based"}
    
    http://localhost:8124/tickets/new?policy=requests_based
    200 OK {"result":"OK","ticket":"0b4e20ce63f7de9a4a77910e7f909e5dba4538f3","expires_in":100,"policy":"requests_based"}
    
    http://localhost:8124/tickets/new?policy=time_based&seconds=120
    200 OK {"result":"OK","ticket":"50ab14d6f5dd082e8ed343f7adb5f916fa76188a","expires_in":120,"policy":"time_based"}
    
    http://localhost:8124/tickets/new?policy=cascading&depends_on=f073145dfdf45a6e85d0f758f78fd627fa301983
    200 OK {"result":"OK","ticket":"9ae23360fb4e9b3348917eb5e9b8a8e725b0dcb0","depends_on":"f073145dfdf45a6e85d0f758f78fd627fa301983","policy":"cascading"}
    
    http://localhost:8124/tickets/new?policy=manual_expiration
    200 OK {"result":"OK","ticket":"f57d75c23f6a49951a6e886bbc60de74bc02ef33","policy":"manual_expiration"}

The last kind of tickets has a manual expiration policy, so you must call an appropriate verb to make it expire:

    http://localhost:8124/tickets/f57d75c23f6a49951a6e886bbc60de74bc02ef33/expire
    200 OK {"status":"EXPIRED"}

Subsequent requests for that ticket will give an "EXPIRED" status.


### Valid tickets
Asking for a ticket status is all you can do with a newly created ticket. bagarino will answer with three different statuses:
 * **VALID**
 * **EXPIRED**
 * **NOT_VALID**

The answer will carry some more info when the ticket is still valid:

    http://localhost:8124/tickets/0b4e20ce63f7de9a4a77910e7f909e5dba4538f3/status
    200 OK {"status":"VALID","expires_in":99,"policy":"requests_based"}

In the previous example the expiration policy and the TTL (Time-To-Live) of the ticket are returned, as well as its status.
The parameter *"expires_in"* has to be read based on the policy of the ticket:
 * When the policy is **time_based** then _"expires_in"_ is the number of seconds before the ticket expires
 * When the policy is **requests_based** the value of _"expires_in"_ is the number of requests before the ticket expires


### Expired tickets
Expired tickets are kept in memory by bagarino for 10 days. After that time a call to their status will return "NOT_VALID" as it would for a ticket that didn't exist in the first place.


### Mass-creation of tickets
It's possible to create more tickets at once by adding the paramenter "count" to the query-string of the verb _new_, followed by the number of tickets to be created.
The maximum number of tickets that can be created this way is capped to prevent overloading the system.
Here's a typical request for mass-creation of tickets:

    http://localhost:8124/tickets/new?count=4
    200 OK {"result":"OK","tickets":["9c7800ec9cf053e60674042533710c556fe22949","3cd5da62c2ba6d2b6b8973016264282f61f4afdd","7207c7effb2bd8fd97b885a4f72492a97e79babf","75a6cf2ba0454dfe74a4d6ce8baa80881fb76005"],"expire_in":60,"policy":"time_based"}


### Tickets contexts
Sometimes it may be useful to bound one or more tickets to a "context" so they only acquire a meaning under certain conditions.
In bagarino this is done by attaching a textual context to the ticket during the "new" operation:

    http://localhost:8124/tickets/new?policy=requests_based&context=mysweetlittlecontext
    200 OK {"result":"OK","ticket":"7486f1dcf4fc4d3c4ef257230060aea531d42758","expires_in":100,"policy":"requests_based"}

Once it's scoped this way requests for that ticket status that don't specify the context won't be able to retrieve it, resulting in a "not_found" error, the same given when asking for a non-existent ticket:

    http://localhost:8124/tickets/7486f1dcf4fc4d3c4ef257230060aea531d42758/status
    404 Not Found {"status":"ERROR","cause":"not_found"}

The way to ask for a context-bound token is as follows:

    http://localhost:8124/tickets/7486f1dcf4fc4d3c4ef257230060aea531d42758/status?context=mysweetlittlecontext
    200 OK {"status":"VALID","expires_in":99,"policy":"requests_based"}




LICENSE - Apache License v2
---------------------------
Copyright (c) 2013 Nicola Orritos

Licensed under the Apache License, Version 2.0 (the "License");
you may not use these files except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

