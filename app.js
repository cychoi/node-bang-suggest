/***************
 * Proxy Server for Google Suggestions for Duck Duck Go searches with bangs
 *
 * This server takes a given query and pulls in google suggestions. If the query started with a !,
 * this server will restore the ! in all of google's suggestions.
 *
 * This is designed for use with the Duck Duck Go + google Suggest OpenSearch plugin found here:
 * http://ddgg.nfriedly.com/
 *
 * This project is hosted on github:  https://github.com/nfriedly/node-bang-suggest
 *
 * Copyright Nathan Friedly - http://nfriedly.com - MIT License
 */

// imports
var http = require('http'),
    url = require('url'),
    querystring = require('querystring'),
    static = require('node-static');
    
var fileServer = new static.Server('./public');

// for great performance!
// kind of hard to see much difference in local testing, but I think this should make an appreciable improvement in production
// https://github.com/substack/hyperquest#rant
http.globalAgent.maxSockets = 64;

function app(request, response) {
    var url_data = url.parse(request.url);

    if (url_data.pathname == "/complete/search") {
        return forward(request, response);
    }

    //if (url_data.pathname == "/") {
    //    request.url = "/index.html";
    //}
    fileServer.serve(request, response);
}


function forward(request, response) {

    // get our request
    var params = querystring.parse(url.parse(request.url).query);

    params.q = params.q || "";

    // check that there was a bang at the beginning of the request
    // if there's not, then this shoud really be handled by nginx,
    // but oh well....
    var bang = params.q && params.q.substr(0, 1) == "!";

    var xml = params.client && params.client.substr(0, 2) == "ie";

    var options = {
        host: 'suggestqueries.google.com',
        path: '/complete/search?' + querystring.stringify(params)
    };

    // initiate our call to google
    var g_request = http.get(options, function(g_response) {

        // forward the HTTP status code and headers
        response.writeHead(g_response.statusCode,
            g_response.headers);

        // forward the data when it arrives
        g_response.on('data', function(chunk) {

            // only process the data if the original request started with a !
            if (bang) {
                chunk = chunk.toString();
                if (xml) {
                    chunk = chunk.replace(/<Text>(\w)/g, '<Text>!$1');
                } else {
                    try {
                        // try to do it properly first
                        var data = JSON.parse(chunk);
                        data[1] = data[1].map(function(str) {
                            return "!" + str;
                        });
                        chunk = JSON.stringify(data);
                    } catch (ex) {
                        // for incomplete data / invalid JSON; 
                        // this method adds in extra !'s if there are quotes within the query.
                        chunk = chunk.replace(/"(\w)/g, '"!$1');
                    }
                }
            }

            // send the data back to the client
            response.write(chunk); // , 'binary'
        });

        // when the connection to google ends, close the client's connection
        g_response.addListener('end', function() {
            response.end();
        });

    });

    g_request.addListener('error', function(err) {
        error(request, response, 500, err);
    });
}

// a quick way to throw error messages
function error(request, response, status, text) {
    response.writeHead(status, {
        "Content-Type": "text/plain"
    });
    response.write("Error " + status + ": " + text + "\n");
    response.end();
}


module.exports = app;
