var util = require('util');

var tl = require('../lib/teleportd.js').teleportd({ apikey: '02bc638df5c4fce00d086f57c230648a9e193d296bbd7a33a9efa53acd46df11cf82ccc06c38a6e390407e44bc05b27e657ad81f860136a3f62787b4638411de' });


/*
tl.search({ string: 'ford' }, 
	  function(hits, total, took) {
            console.log('hits: ' + util.inspect(hits));
            console.log('total: ' + util.inspect(total));
            console.log('took: ' + util.inspect(took));
	  });

tl.get('12-01-31-fb2fcc847a96681ef9cd61c011a6f93e3d92ef7f', 
       function(pic) {
         console.log(util.inspect(pic));
       });
*/

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
}, 1000);
