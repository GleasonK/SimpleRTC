(function(){
	
	
var CONTROLLER = window.CONTROLLER = function(phone, stream){
	if (!window.phone) window.phone = phone;
	var ctrlChan  = controlChannel(phone.number());
	var isStream  = stream || false;
	var pubnub    = phone.pubnub;
	var userArray = [];
	subscribe();
	
	var CONTROLLER = function(){};
	
	// Get the control version of a users channel
	function controlChannel(number){
		return number + "-ctrl";
	}
	
	// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
	// Setup Phone and Session callbacks.
	// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
	var readycb   = function(session){};
    var messagecb = function(session){};
    var videotogglecb = function(session, isEnabled){};
    var audiotogglecb = function(session, isEnabled){};
    
    CONTROLLER.ready   = function(cb) { readycb   = cb };
    CONTROLLER.message = function(cb) { messagecb = cb };
    CONTROLLER.videoToggled = function(cb) { videotogglecb = cb };
    CONTROLLER.audioToggled = function(cb) { audiotogglecb = cb };
	
	phone.ready(function(){ readycb() });
	phone.receive(function(session){
		CONTROLLER.manageUsers(session);
		receivecb(session);
	});

	
	// Require some boolean form of authentication to accept a call
	CONTROLLER.postAuth = function(session, auth, cb){
		auth(acceptCall(session, cb), session);
	}
	
	function acceptCall(session, cb){ // Return function bound to session that needs a boolean.
		return function(accept) {
			if (accept) cb(session);
			else phone.hangup(session.number); 
		}
	}
	
	// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
	// Setup broadcasting, your screen to all.
	// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
	CONTROLLER.broadcast = function(vid){
	    var video = document.createElement('video');
        video.src    = URL.createObjectURL(phone.mystream);
        video.volume = 0.0;
        video.play();
	    vid.innerHTML=""
	    vid.appendChild(video);
	    vid.style.cssText = "-moz-transform: scale(-1, 1); \
-webkit-transform: scale(-1, 1); -o-transform: scale(-1, 1); \
transform: scale(-1, 1); filter: FlipH;";
		
    };
    
    // Give it a div and it will set up the thumbnail image
    CONTROLLER.registerThumbnailHolder = function(thumbnailHolder){
	    CONTROLLER.broadcast(thumbnailHolder);
    };
	
	CONTROLLER.dial = function(number){ // Authenticate here??
		var session = phone.dial(number, get_xirsys_servers()); // Dial Number
		if (!session) return; // No Duplicate Dialing Allowed
	};
	
	CONTROLLER.hangup = function(number){
		if (number) {
			
			phone.hangup(number);
			return publishCtrl(controlChannel(number), "userLeave", phone.number())
		}
		
		phone.hangup();
		
		for (var i=0; i < userArray.length; i++) {
			var cChan = controlChannel(userArray[i].number);
			publishCtrl(cChan, "userLeave", phone.number());
		}
	};
	
	CONTROLLER.toggleAudio = function(){
		var audio = false;
		var audioTracks = window.phone.mystream.getAudioTracks();
		for (var i = 0, l = audioTracks.length; i < l; i++) {
			audioTracks[i].enabled = !audioTracks[i].enabled;
			audio = audioTracks[i].enabled;
		}
		publishCtrlAll("userAudio", {user : phone.number(), audio:audio}); // Stream false if paused
		return audio;
	};
	
	CONTROLLER.toggleVideo = function(){
		var video = false;
		var videoTracks = window.phone.mystream.getVideoTracks();
		for (var i = 0, l = videoTracks.length; i < l; i++) {
			videoTracks[i].enabled = !videoTracks[i].enabled;
			video = videoTracks[i].enabled;
		}
		phone.send({type: "ctrl-userVideo", data: {user : phone.number(), video:video}); // Stream false if paused
		return video;
	};
	
	CONTROLLER.isOnline = function(number, cb){
		pubnub.here_now({
			channel : number,
			callback : function(m){
				console.log(m);  // TODO Comment out
				cb(m.occupancy != 0);
			}
		});
	};
	
	CONTROLLER.manageUsers = function(session){
		if (session.number == phone.number()) return; 	// Do nothing if it is self.
		console.log(phone.number());
		console.log(session.number);
		var idx = findWithAttr(userArray, "number", session.number); // Find session by number
		if (session.closed){
			if (idx != -1) userArray.splice(idx, 1)[0]; // User leaving
		} else {  				// New User added to stream/group
			if (idx == -1) {  	// Tell everyone in array of new user first, then add to array. 
				if (!isStream) { 
					publishCtrlAll("userJoin", session.number);
				}
				userArray.push(session);
			}
		}
		userArray = userArray.filter(function(s){ return !s.closed; }); // Clean to only open talks
		console.log(userArray);
	}
	
	function addToGroupChat(number){
		var session = phone.dial(number, get_xirsys_servers()); // Dial Number
		if (!session) return; 	// No Dupelicate Dialing Allowed
	}
	
	function publishCtrlAll(type, data){
		for (var i=0; i < userArray.length; i++) {
			var cChan = controlChannel(userArray[i].number);
			publishCtrl(cChan, type, data);
		}
	}
	
	function publishCtrl(ch, type, data){
		console.log("Pub to " + ch);
		var msg = {type: type, data: data};
		pubnub.publish({ 
			channel: ch,
			message: msg,
			callback : function(m){console.log(m)}
		});
	}
	
	function subscribe(){
		pubnub.subscribe({
            channel    : ctrlChan,
            message    : receive,
            connect    : function() { console.log("Subscribed to " + ctrlChan); }
        });
	}
	
	phone.message(function(m){
		switch(m.type) {
		case "ctrl-userJoin":
			return addToGroupChat(m.data);
		case "ctrl-userLeave":
			var idx = findWithAttr(userArray, "number", m.data);
			if (idx != -1) userArray.splice(idx, 1)[0];
			return;
		case "ctrl-userVideo":
			var idx = findWithAttr(userArray, "number", m.data.user);
			var vidEnabled = m.data.video;
			if (idx != -1) videotogglecb(userArray[idx], vidEnabled);
			return;
		case "ctrl-userAudio":
			var idx = findWithAttr(userArray, "number", m.data.user);
			var audEnabled = m.data.audio;
			if (idx != -1) audiotogglecb(userArray[idx], audEnabled);
			return;
		}
		console.log(m);
		console.log(userArray);
	})
	
	function findWithAttr(array, attr, value) {
	    for(var i = 0; i < array.length; i += 1) {
	        if(array[i][attr] === value) {
	            return i;
	        }
	    }
	    return -1;
	}
	
	return CONTROLLER;
}

})();

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// Request fresh TURN servers from XirSys
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function get_xirsys_servers() {
    var servers;
    $.ajax({
        type: 'POST',
        url: 'https://api.xirsys.com/getIceServers',
        data: {
            room: 'default',
            application: 'default',
            domain: 'www.pubnub-example.com',
            ident: 'pubnub',
            secret: 'dec77661-9b0e-4b19-90d7-3bc3877e64ce',
        },
        success: function(res) {
            res = JSON.parse(res);
            if (!res.e) servers = res.d.iceServers;
        },
        async: false
    });
    return servers;
}
