// Copyright Teleportd Ltd
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var util = require('util');
var crypto = require('crypto');
var http = require('http');
var qs = require('querystring');
var buf = require('buffer');
var events = require('events');
var fwk = require('fwk');

/**
 * Dynamic Parser Object borrowed to twitter-node
 */
var Parser = function Parser() {    
  events.EventEmitter.call(this);
  this.buffer = '';
  return this;
};

// The parser emits events!
Parser.prototype = Object.create(events.EventEmitter.prototype);
Parser.END        = '\r\n';
Parser.END_LENGTH = 2;

Parser.prototype.receive = function receive(buffer) {    
  this.buffer += buffer.toString('utf8');
  var index, json;    
  // We have END?
  while ((index = this.buffer.indexOf(Parser.END)) > -1) {
    json = this.buffer.slice(0, index);
    this.buffer = this.buffer.slice(index + Parser.END_LENGTH);
    if (json.length > 0) {    
      try {
	json = JSON.parse(json);
	this.emit('object', json);
      } catch (error) {
	this.emit('error', error);
      }
    }
  }
};


/**
 * Teleportd API Wrapper Object
 * 
 * @extends {}
 * 
 * @param spec {apikey}
 */
var teleportd = function(spec, my) {
  my = my || {};
  var _super = {};

  my.streams = {};
  my.nextsid = 1;  

  my.apikey = spec.apikey || "INVALID";

  // public
  var search; /* search({loc, string, period, from, size}, function(hits, total, took) {...}); */
  var stream; /* stream({loc, string}, function(pic) {...}); */
  var stop;   /* stop(sid); */
  var get;    /* get(sha, function(pic) {...}); */

  // Internal
  var tag;    /* tag(sha, tag, function(err) {...}); */
  var untag;  /* tag(sha, tag, function(err) {...}); */

  // private
  var build;

  var that = {};

  /**
   * builds the get query
   * @param spec search spec
   * @return options 
   */
  build = function(spec, endpoint) {
    var headers = {'User-Agent': 'NodeJS Teleportd API Driver v0.1.0'};
    
    var q = { accesskey: my.apikey };
    // parameters validation
    if(Array.isArray(spec.loc) && spec.loc.length === 4)       // loc     [stream|search]
      q.loc = JSON.stringify(spec.loc);
    if(typeof spec.string === 'string')                        // string  [stream|search]
      q.str = spec.string;
    if(Array.isArray(spec.period) && spec.period.length === 2) // period  [search]
      q.period = JSON.stringify(spec.period);
    if(typeof spec.from === 'number')                          // from    [search]
      q.from = spec.from;
    if(typeof spec.size === 'number')                          // skip    [search]
      q.size = spec.size;

    if(typeof spec.sha === 'string')                           // sha     [get]
      q.sha = spec.sha;

    var options = { host: 'api.core.teleportd.com',
	    	    port: 80,
	    	    path: '/' + endpoint + '?' + qs.stringify(q),
	    	    headers: headers };

    return options;    
  };

  /**
   * Performs a search and returns the array of pic received
   * @param spec {loc, string, period, from, size}
   * @param cb   callback function cb(err, hits, total, took)
   */
  search = function(spec, cb) {
    http.get(build(spec, 'search'), function(res) {
      var body = '';
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          var res = JSON.parse(body);
          if(res.ok)
            cb(null, res.hits, res.total, res.took);
          else
            cb(new Error('Search fail'));
        }
        catch (e) {
          cb(e);
        }
      });
    });
  };
  
  /**
   * Starts a stream search and calls cb on each pic received
   * @param spec {loc, string}
   * @param cb   callback function
   * @return sid stream id
   */
  stream = function(spec, cb, id) {
    var sid = my.nextsid++;       
    if(typeof id !== 'undefined')
      sid = id;      
    if(typeof my.streams[sid] === 'undefined')
      my.streams[sid] = { error: 0,
                          cb: cb };
    
    var restart = function() {
      if(typeof my.streams[sid] !== 'undefined') {        
        my.streams[sid].error++;
        if(my.streams[sid].error > 5)
	  my.streams[sid].error = 5;
        util.debug('STREAM RESTART COUNT: ' + (my.streams[sid].error - 1) + ' ' + (1000 * Math.pow(2, my.streams[sid].error - 1)));
        setTimeout(function() {			      
	  stream(spec, cb, sid);
	}, 1000 * Math.pow(2, my.streams[sid].error - 1));		 
      }
    };	       
    
    http.get(build(spec, 'stream'), function(res) {
      var parser = new Parser();
      
      my.streams[sid].res = res;
      my.streams[sid].parser = parser;		 
      
      
      parser.on('object', function(pic) {
        my.streams[sid].error = 0;
        cb(pic);
      });
      
      res.on('data', function(chunk) {
        parser.receive(chunk);
      });
      res.on('end', function() {
        restart();
      });	       
      res.on('error', function(e) {
        restart();
      });
      res.connection.on('close', function(e) {
        restart();
      });
      
    }).on('error', function(e) {
      restart();
    });
    
    return sid;
  };

  /**
   * Stops a stream or all the stream
   * @param sid stream id or null for all streams
   */ 
  stop = function(sid) {
    if(sid && my.streams[sid]) {
      if(my.streams[sid].res)
        my.streams[sid].res.destroy();
      my.streams[sid].cb();
      delete my.streams[sid];
    }
    else if(typeof sid === 'undefined') {
      for(var s in my.streams) {
	if(my.streams.hasOwnProperty(s)) {
	  my.streams[s].res.destroy();
          my.streams[s].cb();
        }
      }
      my.streams = {};
    }
  };

  /**
   * Retrieves detailed information about a particular pic
   * @param ss sha 
   * @param cb      callback function cb(err, pic)
   */
  get = function(sha, cb) {
    var spec = {sha: sha};
    http.get(build(spec, 'get'), function(res) {
      var body = '';
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          var res = JSON.parse(body);
          if(res.ok)
            cb(null, res.hit);
          else
            cb(new Error('Get fail'));
        }
        catch(e) {
          cb(e);
        }
      });
    });	       
  };

  /**
   * Add specified tag to a pic
   * /!\ For internal use only
   * @param sha
   * @param tag
   * @param cb    callback function cb(err)
   */
  tag = function(sha, tag, cb) {
    var options = { host: 'post.core.teleportd.com',
                    port: 80,
                    path: '/tag?' + sha,
                    method: 'POST',
                    headers: { "content-type": 'application/json',
                               "x-teleportd-accesskey": my.apikey }
                  };
    var body = '';

    var req = http.request(options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          var post = JSON.parse(body);
          if (post.ok)
            cb();
        }
        catch(e) {
          cb(e);
        }
      });
    });
    
    req.on('error', function(e) {
      cb(e);
    });
    
    req.write(JSON.stringify({tag: tag}));
    req.end();
  };


  /**
   * Remove a specified tag from a pic
   * /!\ For internal use only
   * @param sha
   * @param tag
   * @param cb    callback function(err)
   */
  untag = function(sha, tag, cb) {
    var options = { host: 'post.core.teleportd.com',
                    port: 80,
                    path: '/untag?' + sha,
                    method: 'POST',
                    headers: { "content-type": 'application/json',
                               "x-teleportd-accesskey": my.apikey }
                  };
    var body = '';
    
    var req = http.request(options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          var post = JSON.parse(body);
          if (post.ok)
            cb();
        }
        catch(e) {
          cb(e);
        }
      });
    });
    
    req.on('error', function(e) {
      cb(e);
    });
    
    req.write(JSON.stringify({tag: tag}));
    req.end();
  };


  // exposed methods
  fwk.method(that, 'search', search, _super);
  fwk.method(that, 'stream', stream, _super);
  fwk.method(that, 'stop', stop, _super);
  fwk.method(that, 'get', get, _super);

  // internal use
  fwk.method(that, 'tag', tag, _super);
  fwk.method(that, 'untag', tag, _super);

  return that;
};

exports.teleportd = teleportd;