(function(Pd){

    /******************** Base Object *****************/
    Pd.Object = function (pd, args) {
        args = args || [];
        // the patch this object belong to
        this.setPatch((pd || null));
        // id of the object in this patch
        this.setId(null);
	    // frame counter - how many frames have we run for
	    this.frame = 0;
	
	    // create the inlets and outlets array for this object
	    // array holds 2-tuple entries of [src-object, src-outlet-number]
	    this.inlets = [];
	    // array holds 2-tuple entries of [dest-object, dest-inlet-number]
	    this.outlets = [];
	    // create inlets and outlets specified in the object's proto
        var outletTypes = this.outletTypes;
        var inletTypes = this.inletTypes;
	    for (var i=0; i<outletTypes.length; i++) {
		    this.outlets[i] = new Pd[outletTypes[i]](this, i);
	    }
	    for (var i=0; i<inletTypes.length; i++) {
		    this.inlets[i] = new Pd[inletTypes[i]](this, i);
	    }

        // pre-initializes the object, handling the creation arguments
        // TODO: if there's any reason the object needs to know his patch,
        // then this doesn't belong here
	    this.preinit.apply(this, args);
        // if object was created in a patch, we add it to the graph
	    if (pd) {
            // TODO: ugly check shouldn't be there ... most likely in the table subclass
            if (this instanceof Pd.objects['table']) pd.addTable(obj);
            else pd.addObject(this);
        }
    };
	
    Pd.extend(Pd.Object.prototype, {

	    /******************** Methods to implement *****************/
		// set to true if this object is a dsp sink (e.g. [dac~], [outlet~], [print~]
		endPoint: false,

        // 'dsp'/'message'
		outletTypes: [],

        // Beware, inlet type doesn't have the exact same meaning as
        // outlet type, cause dsp capable inlets also take messages.  
		inletTypes: [],

        preinit: function() {},

        init: function() {},

        // method which runs every frame for this object
		dspTick: function() {},

        // method which runs when this object receives a message at any inlet
		message: function(inletnumber, message) {},


	    /******************** Common methods *********************/
	    /** Converts a Pd message to a float **/
	    toFloat: function(data) {
		    // first check if we just got an actual float, return it if so
		    if (!isNaN(data)) return data;
		    // otherwise parse this thing
		    var element = data.split(" ")[0];
		    var foundfloat = parseFloat(element);
		    if (!isNaN(foundfloat)) {
			    element = foundfloat;
		    } else if (element != "symbol") {
			    Pd.log("error: trigger: can only convert 's' to 'b' or 'a'")
			    element = "";
		    } else {
			    element = 0;
		    }
		    return element;
	    },
	
	    /** Converts a Pd message to a symbol **/
	    toSymbol: function(data) {
		    var element = data.split(" ")[0];
		    if (!isNaN(parseFloat(element))) {
			    element = "symbol float";
		    } else if (element != "symbol") {
			    Pd.log("error: trigger: can only convert 's' to 'b' or 'a'")
			    element = "";
		    } else {
			    element = "symbol " + data.split(" ")[1];
		    }
		    return element;
	    },
	
	    /** Convert a Pd message to a bang **/
	    toBang: function(data) {
		    return "bang";
	    },
	
	    /** Convert a Pd message to a javascript array **/
	    toArray: function(msg) {
		    var type = typeof(msg);
		    // if it's a string, split the atom
		    if (type == "string") {
			    var parts = msg.split(" ");
			    if (parts[0] == "list")
				    parts.shift();
			    return parts;
		    // if it's an int, make a single valued array
		    } else if (type == "number") {
			    return [msg];
		    // otherwise it's proably an object/array and should stay that way
		    } else {
			    return msg;
		    }
	    },
	
	    /** Sends a message to a particular outlet **/
	    sendMessage: function(outletnum, msg) {
		    if (this.outlets[outletnum]) this.outlets[outletnum].message(msg);
		    else {
			    throw (new Error("object has no outlet #" + outletnum));
		    }
	    },

	    /******************** Accessors ************************/
    	// Returns the a unique identifier of the object in its current patch.
        // This id is assigned automatically when the object is added to the patch.
        getId: function() {
            return this._id;
        },

        setId: function(id) {
            this._id = id
        },

        getPatch: function(pd) {
            return this._pd;
        },

        setPatch: function(pd) {
            this._pd = pd;
        }

    });

    // Convenience function for making it easier to extend Pd.Object
    Pd.Object.extend = Pd.chainExtend;


    /******************** Inlets/outlets *****************/
    var BasePortlet = function(obj, id) {
        this._obj = obj;
        this._id = id;
        this.init();
    };
    Pd.extend(BasePortlet.prototype, {

        init: function() { Pd.notImplemented(); },

        connect: function(other) { Pd.notImplemented(); },

        getId: function() { return this._id; },

        getObject: function() { return this._obj; }

    });
    BasePortlet.extend = Pd.chainExtend;

    var BaseInlet = BasePortlet.extend({

        init: function() {
            this.sources = [];
        },

        connect: function(source) {
            this.sources.push(source);
        },

        // message received callback
        message: function(msg) {
	        this.getObject().message(this.getId(), msg);
        },

        // Returns a buffer to read dsp data from.
        getBuffer: function() { Pd.notImplemented(); },

        // Returns true if the inlet has dsp sources, false otherwise
        hasDspSources: function() { Pd.notImplemented(); }

    });

    var BaseOutlet = BasePortlet.extend({

        init: function() {
            this.sinks = [];
        },

        connect: function(sink) {
            this.sinks.push(sink);
        },

        // Returns a buffer to write dsp data to.
        getBuffer: function() { Pd.notImplemented(); },

        // Sends a message to all sinks
        sendMessage: function(msg) { Pd.notImplemented(); }

    });


    // message inlet. Simply receives messages and dispatches them to
    // the inlet's object.
    Pd['inlet'] = BaseInlet.extend({

        getBuffer: function() {
            throw (new Error ('No dsp buffer on a message inlet'));
        },

        hasDspSources: function() {
            throw (new Error ('A message inlet cannot have dsp sources'));
        }

    });

    // dsp inlet. Pulls dsp data from all sources. Also accepts messages.
    Pd['inlet~'] = BaseInlet.extend({

        init: function() {
            BaseInlet.prototype.init.apply(this, arguments);
            this._dspSources = [];
            this._buffer = new Pd.arrayType(Pd.blockSize);
            this._zerosBuffer = new Pd.arrayType(Pd.blockSize);
            for (var i; i<this._zerosBuffer.length; i++) {
                this._zerosBuffer[i] = 0;
            }
        },

        getBuffer: function() {
            var dspSources = this._dspSources;

            // if more than one dsp source, we have to sum the signals.
            if (dspSources.length > 1) {
                var buffer = this._buffer;
                var sourceBuff;
                for (var i=0; i<buffer.length; i++) buffer[i] = 0;

                for (var i=0; i<dspSources.length; i++) {
                    sourceBuff = dspSources[i].getBuffer();
                    for (var j=0; j<buffer.length; j++) {
                        buffer[j] += sourceBuff[j];
                    }
                }
                return buffer;

            // if only one dsp source, we can pass the signal as is.
            } else if (dspSources.length == 1) {
                return dspSources[0].getBuffer();

            // if no dsp source, just pass some zeros
            } else {
                return this._zerosBuffer;
            }
        },

        connect: function(source) {
            BaseInlet.prototype.connect.apply(this, arguments);
            if (source instanceof Pd['outlet~']) this._dspSources.push(source);  
        },

        hasDspSources: function() {
            return this._dspSources.length > 0;
        }

    });

    // message outlet. Dispatches messages to all the sinks
    Pd['outlet'] = BaseOutlet.extend({

        getBuffer: function() {
            throw (new Error ('No dsp buffer on a message outlet'));
        },

        sendMessage: function(msg) {
            for (var i=0; i<this.sinks.length; i++) {
                this.sinks[i].message(msg);
            }
        }

    });

    // dsp outlet. Only contains a buffer, written to by the outlet's object.
    Pd['outlet~'] = BaseOutlet.extend({

        init: function() {
            BaseOutlet.prototype.init.apply(this, arguments);
            this._buffer = new Pd.arrayType(Pd.blockSize);
        },

        getBuffer: function() {
            return this._buffer;
        },

        sendMessage: function() {
            throw (new Error ('message received on dsp outlet, pas bon'));
        }

    });

})(this.Pd);
