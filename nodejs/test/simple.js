var util = require('util');

var tl = require('../lib/teleportd.js').teleportd({ apikey: 'APIKEY' });


tl.search({ string: 'red' }, 
	  function(hits, total, took) {
            console.log('hits: ' + util.inspect(hits));
            console.log('total: ' + util.inspect(total));
            console.log('took: ' + util.inspect(took));
	  });

/*
tl.get('12-01-31-fb2fcc847a96681ef9cd61c011a6f93e3d92ef7f', 
       function(pic) {
         console.log(util.inspect(pic));
       });
*/

/*
var sid = tl.stream({ string: 'src:instagram' }, 
		    function(pic) {
		      if(typeof pic == 'undefined')
			util.debug('STREAM: END!');
		      else
			util.debug('STREAM: ' + util.inspect(pic));
		    });

setTimeout(function() {
    console.log('TOP!');
    tl.stop(sid);
  }, 5000);

*/